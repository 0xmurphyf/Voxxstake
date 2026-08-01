import { Router, Response } from 'express';
import { Stake } from '../models/Stake';
import { StakeSummary } from '../models/StakeSummary';
import { Profile } from '../models/Profile';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOwnedObjects, getNftMetadata, extractImageUrl, extractNftName } from '../services/sui';
import {
  buildPositionFromStake,
  buildStatsFromPositions,
  computeTotalActiveSeconds,
  computePoints,
  getHoldingMultiplier,
} from '../services/staking';
import { VOXX_TYPE } from '../types';
import { config } from '../config';
import { withMutex } from '../services/mutex';
import { createThrottle } from '../services/throttle';
import { reconcileOwnedStakes } from '../services/ownershipSync';
import { rebuildRankingSnapshot } from '../services/backgroundSync';

const router = Router();

// ─── In-memory rate-limit cache (per address, last sync timestamp) ──
// Timer-based cleanup (60s) replaces the old "clean every 100 inserts" pattern.
const syncRateLimitMap = new Map<string, number>();

// Timer-based cleanup: every 60s, evict entries older than 2x the rate limit.
// unref so the timer doesn't keep the process alive in test environments.
const syncRateLimitCleanup = setInterval(() => {
  const cutoff = Date.now() - config.syncRateLimitSeconds * 1000 * 2;
  for (const [key, ts] of syncRateLimitMap) {
    if (ts < cutoff) syncRateLimitMap.delete(key);
  }
}, 60_000);
if (syncRateLimitCleanup.unref) syncRateLimitCleanup.unref();

function checkSyncRateLimit(address: string): boolean {
  const lastSync = syncRateLimitMap.get(address);
  if (!lastSync) return false;
  const elapsed = (Date.now() - lastSync) / 1000;
  return elapsed < config.syncRateLimitSeconds;
}

function setSyncRateLimit(address: string): void {
  syncRateLimitMap.set(address, Date.now());
}

async function refreshRankingAfterCompleteSync(address: string): Promise<void> {
  try {
    await rebuildRankingSnapshot();
  } catch (error) {
    // The ownership sync is still valid even if the derived public snapshot
    // cannot be rebuilt. Log it so the background cycle can retry later.
    console.error(`[Staking] Ranking refresh failed after syncing ${address}:`, error);
  }
}

/**
 * Apply admin overrides from Profile to multiplier and total_lore_points.
 * Mirrors the same logic in rebuildRankingSnapshot so the ID Card always
 * shows the same values as the Waiting List.
 */
async function applyAdminOverrides(
  address: string,
  stats: { holding_multiplier: number; total_lore_points: number }
): Promise<void> {
  const profile = await Profile.findOne({ address }, 'credit_override multiplier_override').lean();
  if (!profile) return;

  if (typeof profile.multiplier_override === 'number') {
    stats.holding_multiplier = Math.max(0.001, stats.holding_multiplier + profile.multiplier_override);
  }

  if (typeof profile.credit_override === 'number') {
    stats.total_lore_points = Math.max(0, stats.total_lore_points + profile.credit_override);
  }
}

/**
 * Sync helper: for a given address, pull chain data and update DB.
 * Returns the scan result. kioskError means the ownedMap is only partial and
 * must never replace the last complete on-chain count.
 */
async function syncStakesForAddress(
  address: string
): Promise<{
  ownedMap: Map<string, { name: string; image_url: string | null }>;
  sellAlerts: string[];
  kioskError: boolean;
}> {
  // Fetch owned NFTs from chain (lite mode: type + display only)
  const { objects: ownedNfts, kioskError } = await getOwnedObjects(address, VOXX_TYPE, true);
  const ownedMap = new Map<string, { name: string; image_url: string | null }>();
  for (const nft of ownedNfts) {
    const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
    const objId = data?.objectId as string;
    if (!objId) continue;
    ownedMap.set(objId, {
      name: extractNftName(data, objId),
      image_url: extractImageUrl(data),
    });
  }

  const { sellAlerts } = await reconcileOwnedStakes({
    address,
    ownedMap,
    scanComplete: !kioskError,
  });

  return { ownedMap, sellAlerts, kioskError };
}

// ─── GET /api/staking/cached ───────────────────────────────────
// Fast DB-only read.
router.get('/cached', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;

    const stakes = await Stake.find({ address }).lean();
    // nft_count must mean the same thing everywhere: the on-chain OWNED count
    // from the last successful sync (persisted in StakeSummary). Fall back to
    // active-DB stakes only when the user has never synced.
    const summary = await StakeSummary.findOne({ address }).lean();
    const nftCount = summary ? summary.nft_count : stakes.filter(s => s.status === 'active').length;
    const holdingMultiplier = getHoldingMultiplier(nftCount);

    const ownedSet = new Set(stakes.filter(s => s.status === 'active').map(s => s.object_id));
    const positions = stakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, holdingMultiplier, ownedSet)
    );

    // Determine sync status
    const hasEverSynced = stakes.length > 0;
    const lastSyncedTimestamps = stakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();
    const last_synced = lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null;

    const stats = buildStatsFromPositions(positions, [], nftCount, holdingMultiplier);
    // Apply admin overrides so ID Card matches Waiting List
    await applyAdminOverrides(address, stats);
    res.json({
      ...stats,
      synced: hasEverSynced,
      last_synced,
    });
  } catch (err) {
    console.error('Cached stakes error:', err);
    res.status(500).json({ detail: 'Failed to load cached stakes' });
  }
});

// ─── POST /api/staking/sync ────────────────────────────────────
// Full RPC sync. Rate-limited to 1 call per address per SYNC_RATE_LIMIT_SEC.
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response) => {
  const address = req.address!;

  // Rate limit check
  if (checkSyncRateLimit(address)) {
    res.status(429).json({
      detail: `Rate limited. Please wait ${config.syncRateLimitSeconds}s between syncs.`,
      retry_after_seconds: config.syncRateLimitSeconds,
    });
    return;
  }

  try {
    const { ownedMap, sellAlerts, kioskError } = await withMutex(address, () => syncStakesForAddress(address));

    // Only set the rate limit AFTER a successful sync. If the chain call
    // fails (RPC timeout, etc.), the user can retry immediately instead of
    // being locked out for 60s with no data.
    setSyncRateLimit(address);

    const freshStakes = await Stake.find({ address }).lean();
    const activeStakeIds = freshStakes
      .filter((s) => s.status === 'active')
      .map((s) => s.object_id);
    const previousSummary = kioskError
      ? await StakeSummary.findOne({ address }).lean()
      : null;
    const nftCount = kioskError
      ? Math.max(previousSummary?.nft_count || 0, activeStakeIds.length, ownedMap.size)
      : ownedMap.size;
    const holdingMultiplier = getHoldingMultiplier(nftCount);
    const ownedSet = kioskError
      ? new Set(activeStakeIds)
      : new Set(ownedMap.keys());

    // Only a complete direct + Kiosk scan may replace the cached ground truth.
    if (!kioskError) {
      await StakeSummary.findOneAndUpdate(
        { address },
        { $set: { nft_count: nftCount, last_synced: new Date() } },
        { upsert: true }
      );
      // The ID Card refreshes the public rank immediately after this request.
      // Keep that derived snapshot in step with the just-persisted chain truth.
      await refreshRankingAfterCompleteSync(address);
    }
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(
        s as unknown as import('../models/Stake').IStake,
        holdingMultiplier,
        ownedSet
      )
    );

    const stats = buildStatsFromPositions(positions, sellAlerts, nftCount, holdingMultiplier);
    // Apply admin overrides so ID Card matches Waiting List
    await applyAdminOverrides(address, stats);
    const lastSyncedTimestamps = freshStakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();

    res.json({
      ...stats,
      synced: true,
      scan_partial: kioskError,
      last_synced: lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null,
    });
  } catch (err) {
    console.error('Sync stakes error:', err);
    res.status(500).json({ detail: 'Failed to sync stakes' });
  }
});

// ─── GET /api/staking/positions ─────────────────────────────────
// Backward-compat alias: triggers a sync and returns positions.
router.get('/positions', authMiddleware, async (req: AuthRequest, res: Response) => {
  const address = req.address!;

  if (checkSyncRateLimit(address)) {
    // Fall back to cached data if rate-limited
    try {
      const stakes = await Stake.find({ address }).lean();
      const summary = await StakeSummary.findOne({ address }).lean();
      const nftCount = summary ? summary.nft_count : stakes.filter(s => s.status === 'active').length;
      const holdingMultiplier = getHoldingMultiplier(nftCount);
      const ownedSet = new Set(stakes.filter(s => s.status === 'active').map(s => s.object_id));
      const positions = stakes.map((s) =>
        buildPositionFromStake(s as unknown as import('../models/Stake').IStake, holdingMultiplier, ownedSet)
      );
      const stats = buildStatsFromPositions(positions, [], nftCount, holdingMultiplier);
      // Apply admin overrides so ID Card matches Waiting List
      await applyAdminOverrides(address, stats);
      const lastSyncedTimestamps = stakes
        .map(s => s.last_synced)
        .filter(Boolean)
        .sort()
        .reverse();
      res.json({
        ...stats,
        synced: stakes.length > 0,
        last_synced: lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null,
        rate_limited: true,
      });
      return;
    } catch (err) {
      console.error('Positions fallback error:', err);
      res.status(500).json({ detail: 'Failed to load positions' });
      return;
    }
  }

  try {
    const { ownedMap, sellAlerts, kioskError } = await withMutex(address, () => syncStakesForAddress(address));

    // Only set the rate limit AFTER a successful sync.
    setSyncRateLimit(address);

    const freshStakes = await Stake.find({ address }).lean();
    const activeStakeIds = freshStakes
      .filter((s) => s.status === 'active')
      .map((s) => s.object_id);
    const previousSummary = kioskError
      ? await StakeSummary.findOne({ address }).lean()
      : null;
    const nftCount = kioskError
      ? Math.max(previousSummary?.nft_count || 0, activeStakeIds.length, ownedMap.size)
      : ownedMap.size;
    const holdingMultiplier = getHoldingMultiplier(nftCount);
    const ownedSet = kioskError
      ? new Set(activeStakeIds)
      : new Set(ownedMap.keys());

    if (!kioskError) {
      await StakeSummary.findOneAndUpdate(
        { address },
        { $set: { nft_count: nftCount, last_synced: new Date() } },
        { upsert: true }
      );
      await refreshRankingAfterCompleteSync(address);
    }
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, holdingMultiplier, ownedSet)
    );

    const stats = buildStatsFromPositions(positions, sellAlerts, nftCount, holdingMultiplier);
    // Apply admin overrides so ID Card matches Waiting List
    await applyAdminOverrides(address, stats);
    const lastSyncedTimestamps = freshStakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();

    res.json({
      ...stats,
      synced: true,
      scan_partial: kioskError,
      last_synced: lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null,
    });
  } catch (err) {
    console.error('Positions error:', err);
    res.status(500).json({ detail: 'Failed to load positions' });
  }
});

// ─── GET /api/staking/nft/:objectId ─────────────────────────────
// Validate objectId format before hitting the RPC — prevents quota waste
// from malformed or fuzzed object IDs.
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

// Per-user throttle for NFT detail — prevents an authenticated attacker from
// enumerating objectIds rapidly and burning RPC quota. 500ms cooldown.
// Timer-based cleanup via createThrottle (no size%N memory leak).
const nftDetailThrottle = createThrottle({ minIntervalMs: 500 });

router.get('/nft/:objectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const address = req.address!;

  // Per-user rate limit
  if (!nftDetailThrottle.allow(address)) {
    res.status(429).json({ detail: 'Too many NFT detail requests, slow down.' });
    return;
  }

  try {
    const address = req.address!;
    const { objectId } = req.params;

    if (!SUI_OBJECT_ID_RE.test(objectId)) {
      res.status(400).json({ detail: 'Invalid Sui object ID format' });
      return;
    }

    const metadata = await getNftMetadata(objectId);

    const stake = await Stake.findOne({ address, object_id: objectId }).lean();

    // Count active stakes to determine holding multiplier
    const activeCount = await Stake.countDocuments({ address, status: 'active' });
    const holdingMultiplier = getHoldingMultiplier(activeCount);

    let position: Record<string, unknown> | null = null;
    if (stake) {
      const s = stake as unknown as import('../models/Stake').IStake;
      const now = new Date();
      const totalActiveSeconds = computeTotalActiveSeconds(s, now);
      const { points, durationDays } = computePoints(s, holdingMultiplier, now);
      position = {
        status: s.status,
        lore_points: points,
        duration_days: durationDays,
        holding_multiplier: holdingMultiplier,
        created_at: s.created_at,
        current_session_start: s.current_session_start,
      };
    }

    res.json({ metadata, position });
  } catch (err) {
    console.error('NFT detail error:', err);
    res.status(500).json({ detail: 'Failed to load NFT detail' });
  }
});

// ─── DEBUG: GET /api/staking/debug/nfts?address=... (admin only) ──
router.get('/debug/nfts', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!req.address || !config.adminAddresses.includes(req.address.toLowerCase())) {
    res.status(403).json({ detail: 'Admin access required' });
    return;
  }
  const { address } = req.query as { address?: string };
  if (!address) {
    res.status(400).json({ detail: 'Missing ?address= query param' });
    return;
  }
  try {
    const { objects: nfts, kioskError } = await getOwnedObjects(address, VOXX_TYPE, true);
    res.json({
      address,
      count: nfts.length,
      scan_complete: !kioskError,
      nfts: nfts.slice(0, 5),
    });
  } catch (err) {
    console.error('[DEBUG] NFT scan error:', err);
    res.status(500).json({ detail: 'NFT scan failed' });
  }
});

export default router;
