import { Stake } from '../models/Stake';
import { StakeSummary } from '../models/StakeSummary';
import { RankingSnapshot } from '../models/RankingSnapshot';
import { Profile } from '../models/Profile';
import { getOwnedObjects, extractImageUrl, extractNftName } from './sui';
import { VOXX_TYPE } from '../types';
import { getHoldingMultiplier, computeTotalActiveSeconds, computePoints } from './staking';
import { IStake } from '../models/Stake';
import { config } from '../config';
import { withMutex } from './mutex';
import { reconcileOwnedStakes } from './ownershipSync';

/**
 * Background sync: periodically scans all registered addresses' NFTs
 * and updates stake records in the database.
 *
 * This runs independently of user-triggered syncs.
 * Default interval: 10 minutes (configurable via SYNC_INTERVAL_MINUTES env).
 */

const SYNC_INTERVAL_MS =
  parseInt(process.env.SYNC_INTERVAL_MINUTES || '10', 10) * 60 * 1000;

// Per-address timeout for background sync — prevents one stuck address from
// blocking the entire loop (cascading failure). Must be longer than the mutex
// timeout (300s) so the mutex has a chance to release first.
const PER_ADDRESS_SYNC_TIMEOUT_MS = 330_000;
const TARGETED_MUTEX_TIMEOUT_MS = 300_000;
const TARGETED_SYNC_TIMEOUT_MS = 330_000;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let activeSync: Promise<SyncReport> | null = null;

export interface SyncReport {
  addresses: number;
  updated: number;
  errors: number;
  elapsed_ms: number;
  failures: Array<{ address: string; error: string }>;
  results: Array<{ address: string; nft_count: number }>;
}

/**
 * Sync all registered addresses' on-chain NFT holdings with the database.
 */
async function runSyncAddresses(requestedAddresses?: string[]): Promise<SyncReport> {
  const startTime = Date.now();
  let addressCount = 0;
  let updated = 0;
  let errors = 0;
  const failures: Array<{ address: string; error: string }> = [];
  const results: Array<{ address: string; nft_count: number }> = [];
  try {
    let sourceAddresses: string[];
    if (requestedAddresses) {
      sourceAddresses = requestedAddresses;
    } else {
      // Scan every registered wallet, including profiles whose first successful
      // chain scan has not created a Stake row yet. Stake-only legacy wallets are
      // retained as well.
      const [profileAddresses, stakeAddresses] = await Promise.all([
        Profile.distinct('address'),
        Stake.distinct('address'),
      ]);
      sourceAddresses = [...profileAddresses, ...stakeAddresses];
    }
    const addresses = [...new Set(sourceAddresses
      .filter((address): address is string => typeof address === 'string' && address.length > 0)
      .map((address) => address.toLowerCase()))];
    const targeted = requestedAddresses !== undefined;
    const mutexTimeoutMs = targeted ? TARGETED_MUTEX_TIMEOUT_MS : undefined;
    const perAddressTimeoutMs = targeted ? TARGETED_SYNC_TIMEOUT_MS : PER_ADDRESS_SYNC_TIMEOUT_MS;
    addressCount = addresses.length;
    console.log(`[BG Sync] Starting ${targeted ? 'targeted' : 'full'} sync for ${addresses.length} addresses`);

    for (const address of addresses) {
      let perAddrTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Wrap in a per-address timeout so a single hung address (e.g. RPC
        // stall that outlives the mutex timeout) doesn't block the entire loop.
        // The mutex (300s timeout) is the first line of defense; this 330s
        // outer timeout is the safety net.
        const perAddrTimeout = new Promise<never>((_, reject) => {
          perAddrTimer = setTimeout(
            () => reject(new Error(`BG sync timeout for ${address.slice(0, 10)}...`)),
            perAddressTimeoutMs
          );
        });

        const addressResult = await Promise.race([
          withMutex(address, async () => {
        // Fetch owned NFTs from chain
        const { objects: ownedNfts, kioskError, kioskErrorMessage } = await getOwnedObjects(address, VOXX_TYPE, true);
        // A direct-only partial result is not a valid ownership count. Treat it
        // as a failed scan so File Z never reports zero merely because Kiosk RPC
        // failed, and preserve the last complete StakeSummary unchanged.
        if (kioskError) {
          throw new Error(`Kiosk scan incomplete: ${kioskErrorMessage || 'unknown RPC error'}`);
        }
        const ownedMeta = new Map<string, { name: string; image_url: string | null }>();

        for (const nft of ownedNfts) {
          const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
          const objId = data?.objectId as string;
          if (!objId) continue;
          ownedMeta.set(objId, {
            name: extractNftName(data, objId),
            image_url: extractImageUrl(data),
          });
        }

        const { nftCount } = await reconcileOwnedStakes({
          address,
          ownedMap: ownedMeta,
          scanComplete: true,
        });

        await StakeSummary.findOneAndUpdate(
          { address },
          { $set: { nft_count: nftCount, last_synced: new Date() } },
          { upsert: true }
        );

        return { address, nft_count: nftCount };
          }, mutexTimeoutMs), // withMutex
          perAddrTimeout,
        ]);

        results.push(addressResult);
        updated++;
      } catch (err) {
        errors++;
        failures.push({
          address,
          error: err instanceof Error ? err.message : 'Unknown sync error',
        });
        console.error(`[BG Sync] Error syncing ${address}:`, err);
      } finally {
        if (perAddrTimer) clearTimeout(perAddrTimer);
      }

      // Small delay between addresses to avoid RPC rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[BG Sync] Done: ${updated} updated, ${errors} errors in ${elapsed}s`);

    // Rebuild ranking snapshot after sync completes. This is a fast DB-only
    // operation (no chain request) that precomputes the data the /api/ranking endpoint
    // needs, so it never has to full-table-scan on every request.
    try {
      await rebuildRankingSnapshot();
    } catch (err) {
      console.error('[BG Sync] Ranking snapshot rebuild failed:', err);
    }
  } catch (err) {
    console.error('[BG Sync] Fatal error:', err);
    errors++;
    failures.push({
      address: requestedAddresses?.[0] || 'all',
      error: err instanceof Error ? err.message : 'Fatal sync error',
    });
  }

  return {
    addresses: addressCount,
    updated,
    errors,
    elapsed_ms: Date.now() - startTime,
    failures,
    results,
  };
}

/**
 * Return the active full scan when one is already running. This lets File Z
 * wait for the real result instead of starting a duplicate RPC-heavy scan.
 */
async function syncAllAddresses(): Promise<SyncReport> {
  if (activeSync) {
    console.log('[BG Sync] Joining sync already in progress');
    return activeSync;
  }

  activeSync = runSyncAddresses();
  try {
    return await activeSync;
  } finally {
    activeSync = null;
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
 * Rebuild the RankingSnapshot collection from Profile + Stake data.
 * Called after each background sync cycle so the /api/ranking endpoint
 * never needs to full-table-scan.
 */
export async function rebuildRankingSnapshot(): Promise<void> {
  const startTime = Date.now();
  const now = new Date();

  const allProfiles = await Profile.find({}).lean();
  const nameMap = new Map<string, string | null>();
  const creditOverrideMap = new Map<string, number>();
  const multiplierDeltaMap = new Map<string, number>();
  for (const p of allProfiles) {
    const addr = p.address.toLowerCase();
    nameMap.set(addr, p.name || null);
    if (typeof p.credit_override === 'number') creditOverrideMap.set(addr, p.credit_override);
    if (typeof p.multiplier_override === 'number') {
      multiplierDeltaMap.set(addr, p.multiplier_override);
    }
  }

  const allStakes = await Stake.find({}).lean();
  const stakesByAddress = new Map<string, IStake[]>();
  for (const stake of allStakes) {
    const s = stake as unknown as IStake;
    const key = s.address.toLowerCase();
    const existing = stakesByAddress.get(key) || [];
    existing.push(s);
    stakesByAddress.set(key, existing);
  }

  // Also load StakeSummary for on-chain NFT counts (more reliable than stake status)
  const allSummaries = await StakeSummary.find({}).lean();
  const summaryMap = new Map<string, number>();
  for (const s of allSummaries) {
    summaryMap.set(s.address.toLowerCase(), s.nft_count || 0);
  }

  // Build entries from profiles (every authenticated user)
  const entries: Array<{
    address: string;
    display_address: string;
    display_name: string;
    credential_count: number;
    multiplier: number;
    total_credits: number;
    max_duration_days: number;
  }> = [];

  for (const p of allProfiles) {
    const address = p.address.toLowerCase();
    const stakes = stakesByAddress.get(address) || [];
    const activeStakes = stakes.filter(s => s.status === 'active');
    // Prefer StakeSummary.nft_count (on-chain truth) over activeStakes.length.
    // activeStakes may be stale if stake records weren't properly re-assigned
    // after an NFT transfer between wallets.
    const onChainCount = summaryMap.get(address) ?? 0;
    const nftCount = Math.max(activeStakes.length, onChainCount);
    const autoMultiplier = getHoldingMultiplier(nftCount);
    const multiplierDelta = multiplierDeltaMap.get(address) ?? 0;
    const multiplier = Math.max(0.001, autoMultiplier + multiplierDelta);

    let totalCredits = 0;
    let maxDurationDays = 0;
    for (const stake of stakes) {
      const { points, durationDays } = computePoints(stake, multiplier, now);
      totalCredits += points;
      if (durationDays > maxDurationDays) maxDurationDays = durationDays;
    }

    // Apply admin credit override (delta added on top of auto-computed credits)
    const creditOverride = creditOverrideMap.get(address);
    if (typeof creditOverride === 'number') {
      totalCredits = Math.max(0, totalCredits + creditOverride);
    }

    const profileName = nameMap.get(address);
    entries.push({
      address,
      display_address: `${address.slice(0, 8)}...${address.slice(-6)}`,
      display_name: profileName && profileName.trim()
        ? `${profileName.trim()} (0x${address.slice(2, 5)})`
        : `0x${address.slice(2, 5)}`,
      credential_count: nftCount,
      multiplier,
      total_credits: totalCredits,
      max_duration_days: maxDurationDays,
    });
  }

  // Also include stake-only addresses not in Profile (legacy data)
  const profileAddresses = new Set(allProfiles.map(p => p.address.toLowerCase()));
  for (const [address, stakes] of stakesByAddress) {
    if (profileAddresses.has(address)) continue;
    const activeStakes = stakes.filter(s => s.status === 'active');
    const onChainCount = summaryMap.get(address) ?? 0;
    const nftCount = Math.max(activeStakes.length, onChainCount);
    const autoMultiplier = getHoldingMultiplier(nftCount);
    const multiplierDelta = multiplierDeltaMap.get(address) ?? 0;
    const multiplier = Math.max(0.001, autoMultiplier + multiplierDelta);

    let totalCredits = 0;
    let maxDurationDays = 0;
    for (const stake of stakes) {
      const { points, durationDays } = computePoints(stake, multiplier, now);
      totalCredits += points;
      if (durationDays > maxDurationDays) maxDurationDays = durationDays;
    }

    entries.push({
      address,
      display_address: `${address.slice(0, 8)}...${address.slice(-6)}`,
      display_name: `0x${address.slice(2, 5)}`,
      credential_count: nftCount,
      multiplier,
      total_credits: totalCredits,
      max_duration_days: maxDurationDays,
    });
  }

  // Bulk-upsert into RankingSnapshot
  if (entries.length > 0) {
    const ops = entries.map(e => ({
      updateOne: {
        filter: { address: e.address },
        update: { $set: { ...e, updated_at: now } },
        upsert: true,
      },
    }));
    await RankingSnapshot.bulkWrite(ops, { ordered: false });
  }

  // Sync multiplier overrides to active stakes' session_multiplier so the
  // override takes effect in real-time credit computation (not just ranking).
  // Use the final multiplier from each entry (auto + delta already applied).
  for (const entry of entries) {
    const delta = multiplierDeltaMap.get(entry.address);
    if (delta != null && delta !== 0) {
      await Stake.updateMany(
        { address: entry.address, status: 'active' },
        { $set: { session_multiplier: entry.multiplier } }
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[BG Sync] Ranking snapshot rebuilt: ${entries.length} entries in ${elapsed}s`);
}

/**
 * Trigger an immediate sync (useful for testing or admin commands).
 */
export async function triggerSync(): Promise<SyncReport> {
  return syncAllAddresses();
}

/** Scan one operator-selected wallet without waiting for every registered user. */
export async function triggerAddressSync(address: string): Promise<SyncReport> {
  return runSyncAddresses([address]);
}
