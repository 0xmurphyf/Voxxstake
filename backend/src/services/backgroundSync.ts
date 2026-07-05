import { Stake } from '../models/Stake';
import { getOwnedObjects } from './sui';
import { VOXX_TYPE } from '../types';
import { config } from '../config';

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
        // Fetch owned NFTs from chain
        const ownedNfts = await getOwnedObjects(address, VOXX_TYPE, true);
        const ownedSet = new Set<string>();
        const ownedMeta = new Map<string, { name: string; image_url: string | null }>();

        for (const nft of ownedNfts) {
          const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
          const objId = data?.objectId as string;
          if (!objId) continue;
          ownedSet.add(objId);

          const display = ((data.display as Record<string, unknown>)?.data || {}) as Record<string, unknown>;
          ownedMeta.set(objId, {
            name: (display.name as string) || `VOXX #${objId.slice(-6)}`,
            image_url: (display.image_url as string) || null,
          });
        }

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
              last_synced: nowIso,
            });
          }
        }

        // Pause sold/transferred NFTs
        for (const [objId, stake] of existingMap) {
          if (!ownedSet.has(objId) && stake.status === 'active') {
            let sessionSeconds = 0.0;
            if (stake.current_session_start) {
              const sessionStart = new Date(stake.current_session_start);
              sessionSeconds = Math.max(0.0, (now.getTime() - sessionStart.getTime()) / 1000);
            }
            stake.status = 'paused';
            stake.current_session_start = null;
            stake.total_staked_seconds = (stake.total_staked_seconds || 0.0) + sessionSeconds;
            stake.last_synced = nowIso;
            await stake.save();
          }
        }

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
