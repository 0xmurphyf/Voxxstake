import { Stake } from '../models/Stake';
import { StakeSummary } from '../models/StakeSummary';
import { getOwnedObjects, extractImageUrl, extractNftName } from './sui';
import { VOXX_TYPE, POINTS_PER_NFT_PER_HOUR } from '../types';
import { getHoldingMultiplier } from './staking';
import { config } from '../config';
import { withMutex } from './mutex';

/**
 * Background sync: periodically scans all registered addresses' NFTs
 * and updates stake records in the database.
 *
 * This runs independently of user-triggered syncs.
 * Default interval: 10 minutes (configurable via SYNC_INTERVAL_MINUTES env).
 */

const SYNC_INTERVAL_MS =
  parseInt(process.env.SYNC_INTERVAL_MINUTES || '10', 10) * 60 * 1000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

/**
 * Sync all registered addresses' on-chain NFT holdings with the database.
 */
async function syncAllAddresses(): Promise<void> {
  if (isSyncing) {
    console.log('[BG Sync] Previous sync still in progress, skipping');
    return;
  }

  isSyncing = true;
  const startTime = Date.now();
  try {
    // Get all unique addresses that have ever staked
    const addresses = await Stake.distinct('address');
    console.log(`[BG Sync] Starting sync for ${addresses.length} addresses`);

    let updated = 0;
    let errors = 0;

    for (const address of addresses) {
      try {
        await withMutex(address, async () => {
        // Fetch owned NFTs from chain
        const { objects: ownedNfts, kioskError } = await getOwnedObjects(address, VOXX_TYPE, true);
        const ownedSet = new Set<string>();
        const ownedMeta = new Map<string, { name: string; image_url: string | null }>();

        for (const nft of ownedNfts) {
          const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
          const objId = data?.objectId as string;
          if (!objId) continue;
          ownedSet.add(objId);

          ownedMeta.set(objId, {
            name: extractNftName(data, objId),
            image_url: extractImageUrl(data),
          });
        }

        // Current holding multiplier for the address (based on owned NFT count).
        const currentNftCount = ownedSet.size;
        const currentMultiplier = getHoldingMultiplier(currentNftCount);

        const now = new Date();
        const nowIso = now.toISOString();

        // Get existing stakes
        const existingStakes = await Stake.find({ address });
        const existingMap = new Map(existingStakes.map((s) => [s.object_id, s]));

        // Activate owned NFTs
        for (const [objId, meta] of ownedMeta) {
          const existing = existingMap.get(objId);
          if (existing) {
            if (existing.status === 'paused') {
              existing.status = 'active';
              existing.current_session_start = nowIso;
              existing.session_multiplier = currentMultiplier;
            } else {
              // Only ever increase the frozen session multiplier.
              const prevMult =
                typeof existing.session_multiplier === 'number' && existing.session_multiplier > 0
                  ? existing.session_multiplier
                  : 1.0;
              if (prevMult < currentMultiplier) existing.session_multiplier = currentMultiplier;
            }
            existing.name = meta.name;
            existing.image_url = meta.image_url;
            existing.last_synced = nowIso;
            await existing.save();
          } else {
            await Stake.create({
              address,
              object_id: objId,
              name: meta.name,
              image_url: meta.image_url,
              created_at: nowIso,
              total_staked_seconds: 0.0,
              current_session_start: nowIso,
              status: 'active',
              session_multiplier: currentMultiplier,
              last_synced: nowIso,
            });
          }
        }

        // Pause sold/transferred NFTs — but only if Kiosk scan succeeded.
        // If Kiosk scan failed, we might have missed NFTs → don't pause.
        if (!kioskError) {
          // currentNftCount / currentMultiplier already computed above.
          for (const [objId, stake] of existingMap) {
            if (!ownedSet.has(objId) && stake.status === 'active') {
              let sessionSeconds = 0.0;
              if (stake.current_session_start) {
                const sessionStart = new Date(stake.current_session_start);
                sessionSeconds = Math.max(0.0, (now.getTime() - sessionStart.getTime()) / 1000);
              }
              // Lock current session's points at the FROZEN session multiplier
              const lockMult =
                typeof stake.session_multiplier === 'number' && stake.session_multiplier > 0
                  ? stake.session_multiplier
                  : currentMultiplier;
              const sessionHours = sessionSeconds / 3600;
              const sessionPoints = Math.round(sessionHours * POINTS_PER_NFT_PER_HOUR * lockMult);
              stake.locked_points = (stake.locked_points || 0) + sessionPoints;
              stake.status = 'paused';
              stake.current_session_start = null;
              stake.total_staked_seconds = (stake.total_staked_seconds || 0.0) + sessionSeconds;
              stake.last_synced = nowIso;
              await stake.save();
            }
          }
        } else if (existingMap.size > 0 && ownedSet.size === 0) {
          console.warn(`[BG Sync] Kiosk scan failed for ${address.slice(0, 10)}... — 0 direct NFTs, ${existingMap.size} DB stakes preserved`);
        }

        // Keep StakeSummary.nft_count in sync with the ground truth from chain,
        // so /cached and /positions (rate-limit fallback) always report the real
        // owned count — not a stale value from the last user-triggered sync.
        await StakeSummary.findOneAndUpdate(
          { address },
          { $set: { nft_count: ownedSet.size, last_synced: new Date() } },
          { upsert: true }
        );
        }); // withMutex

        updated++;
      } catch (err) {
        errors++;
        console.error(`[BG Sync] Error syncing ${address}:`, err);
      }

      // Small delay between addresses to avoid RPC rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[BG Sync] Done: ${updated} updated, ${errors} errors in ${elapsed}s`);
  } catch (err) {
    console.error('[BG Sync] Fatal error:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the background sync scheduler.
 */
export function startBackgroundSync(): void {
  if (syncTimer) {
    console.log('[BG Sync] Already running');
    return;
  }

  const intervalMin = (SYNC_INTERVAL_MS / 60000).toFixed(0);
  console.log(`[BG Sync] Starting background sync every ${intervalMin} minutes`);

  // Run immediately on startup (after a 30s delay to let the server settle)
  setTimeout(() => {
    syncAllAddresses();
  }, 30000);

  // Then run on interval
  syncTimer = setInterval(syncAllAddresses, SYNC_INTERVAL_MS);
}

/**
 * Stop the background sync scheduler.
 */
export function stopBackgroundSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[BG Sync] Stopped');
  }
}

/**
 * Trigger an immediate sync (useful for testing or admin commands).
 */
export async function triggerSync(): Promise<void> {
  await syncAllAddresses();
}
