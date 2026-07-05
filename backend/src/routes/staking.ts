import { Router, Response } from 'express';
import { Stake } from '../models/Stake';
import { Tier, ITier } from '../models/Tier';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOwnedObjects, getNftMetadata } from '../services/sui';
import {
  DEFAULT_TIERS,
  buildPositionFromStake,
  buildStatsFromPositions,
  computeTotalActiveSeconds,
  computePoints,
} from '../services/staking';
import { VOXX_TYPE, Tier as TierType } from '../types';
import { config } from '../config';

const router = Router();

// ─── In-memory rate-limit cache (per address, last sync timestamp) ──
const syncRateLimitMap = new Map<string, number>();

function checkSyncRateLimit(address: string): boolean {
  const lastSync = syncRateLimitMap.get(address);
  if (!lastSync) return false;
  const elapsed = (Date.now() - lastSync) / 1000;
  return elapsed < config.syncRateLimitSeconds;
}

function setSyncRateLimit(address: string): void {
  syncRateLimitMap.set(address, Date.now());
  // Periodically clean old entries (every 100 sets)
  if (syncRateLimitMap.size % 100 === 0) {
    const cutoff = Date.now() - config.syncRateLimitSeconds * 1000 * 2;
    for (const [key, ts] of syncRateLimitMap) {
      if (ts < cutoff) syncRateLimitMap.delete(key);
    }
  }
}

/**
 * Convert Mongoose ITier[] to plain TierType[].
 */
function toTierType(tiers: ITier[]): TierType[] {
  return tiers.map((t) => ({
    name: t.name,
    multiplier: t.multiplier,
    min_days: t.min_days,
    apy: t.apy,
  }));
}

/**
 * Load tiers from DB, fall back to defaults.
 */
async function loadTiers(): Promise<TierType[]> {
  const tiers = await Tier.find({}).lean();
  if (!tiers || tiers.length === 0) {
    return [...DEFAULT_TIERS];
  }
  return toTierType(tiers as unknown as ITier[]);
}

/**
 * Sync helper: for a given address, pull chain data and update DB.
 * Returns { ownedMap, sellAlerts }.
 */
async function syncStakesForAddress(
  address: string
): Promise<{ ownedMap: Map<string, { name: string; image_url: string | null }>; sellAlerts: string[] }> {
  const tiers = await loadTiers();
  const now = new Date();
  const nowIso = now.toISOString();

  // Fetch owned NFTs from chain (lite mode: type + display only)
  const ownedNfts = await getOwnedObjects(address, VOXX_TYPE, true);
  const ownedMap = new Map<string, { name: string; image_url: string | null }>();
  for (const nft of ownedNfts) {
    const data = (nft as Record<string, unknown>).data as Record<string, unknown>;
    const objId = data?.objectId as string;
    if (!objId) continue;
    const display = ((data.display as Record<string, unknown>)?.data || {}) as Record<string, unknown>;
    ownedMap.set(objId, {
      name: (display.name as string) || `VOXX #${objId.slice(-6)}`,
      image_url: (display.image_url as string) || null,
    });
  }

  const existingStakes = await Stake.find({ address });
  const existingMap = new Map(existingStakes.map((s) => [s.object_id, s]));
  const sellAlerts: string[] = [];

  // 1) For each owned NFT: ensure active stake
  for (const [objId, meta] of ownedMap) {
    const existing = existingMap.get(objId);
    if (existing) {
      if (existing.status === 'paused') {
        // Resume: re-bought the same NFT
        existing.status = 'active';
        existing.current_session_start = nowIso;
        existing.name = meta.name;
        existing.image_url = meta.image_url;
        existing.last_synced = nowIso;
        await existing.save();
      } else {
        // Update metadata + sync timestamp
        existing.name = meta.name;
        existing.image_url = meta.image_url;
        existing.last_synced = nowIso;
        await existing.save();
      }
    } else {
      // New NFT discovered
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

  // 2) Pause stakes for NFTs no longer in wallet (sold / transferred away)
  //    IMPORTANT: On Sui, transfer does NOT change objectId, so we track
  //    by objectId. If an NFT is burn+reminted it gets a new objectId and
  //    is treated as a new stake — the old one stays paused indefinitely.
  for (const [objId, stake] of existingMap) {
    if (!ownedMap.has(objId) && stake.status === 'active') {
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
      sellAlerts.push(stake.name || `VOXX #${objId.slice(-6)}`);
    }
  }

  return { ownedMap, sellAlerts };
}

// ─── GET /api/staking/cached ───────────────────────────────────
// Fast DB-only read. Returns last_synced timestamp and synced flag
// so the frontend can show data freshness.
router.get('/cached', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    const tiers = await loadTiers();

    const stakes = await Stake.find({ address }).lean();
    const positions = stakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, tiers, null)
    );

    // Determine sync status
    const hasEverSynced = stakes.length > 0;
    const lastSyncedTimestamps = stakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();
    const last_synced = lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null;

    const stats = buildStatsFromPositions(positions, []);
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
    setSyncRateLimit(address);

    const { ownedMap, sellAlerts } = await syncStakesForAddress(address);
    const tiers = await loadTiers();

    const freshStakes = await Stake.find({ address }).lean();
    const ownedSet = new Set(ownedMap.keys());
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(
        s as unknown as import('../models/Stake').IStake,
        tiers,
        ownedSet
      )
    );

    const stats = buildStatsFromPositions(positions, sellAlerts);
    const lastSyncedTimestamps = freshStakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();

    res.json({
      ...stats,
      synced: true,
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
      const tiers = await loadTiers();
      const stakes = await Stake.find({ address }).lean();
      const positions = stakes.map((s) =>
        buildPositionFromStake(s as unknown as import('../models/Stake').IStake, tiers, null)
      );
      const stats = buildStatsFromPositions(positions, []);
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
    setSyncRateLimit(address);

    const { ownedMap, sellAlerts } = await syncStakesForAddress(address);
    const tiers = await loadTiers();

    const freshStakes = await Stake.find({ address }).lean();
    const ownedSet = new Set(ownedMap.keys());
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, tiers, ownedSet)
    );

    const stats = buildStatsFromPositions(positions, sellAlerts);
    const lastSyncedTimestamps = freshStakes
      .map(s => s.last_synced)
      .filter(Boolean)
      .sort()
      .reverse();

    res.json({
      ...stats,
      synced: true,
      last_synced: lastSyncedTimestamps.length > 0 ? lastSyncedTimestamps[0] : null,
    });
  } catch (err) {
    console.error('Positions error:', err);
    res.status(500).json({ detail: 'Failed to load positions' });
  }
});

// ─── GET /api/staking/nft/:objectId ─────────────────────────────
router.get('/nft/:objectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    const { objectId } = req.params;

    const metadata = await getNftMetadata(objectId);

    const tiers = await loadTiers();
    const stake = await Stake.findOne({ address, object_id: objectId }).lean();

    let position: Record<string, unknown> | null = null;
    if (stake) {
      const s = stake as unknown as import('../models/Stake').IStake;
      const now = new Date();
      const totalActiveSeconds = computeTotalActiveSeconds(s, now);
      const { points, durationDays, tier } = computePoints(totalActiveSeconds, tiers);
      position = {
        status: s.status,
        lore_points: points,
        duration_days: durationDays,
        tier: tier.name,
        tier_multiplier: tier.multiplier,
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

export default router;

// ─── DEBUG: GET /api/staking/debug/nfts?address=... ──────────────
router.get('/debug/nfts', async (req: AuthRequest, res: Response) => {
  const { address } = req.query as { address?: string };
  if (!address) {
    res.status(400).json({ detail: 'Missing ?address= query param' });
    return;
  }
  try {
    const nfts = await getOwnedObjects(address, VOXX_TYPE, true);
    res.json({ address, count: nfts.length, nfts: nfts.slice(0, 5) });
  } catch (err) {
    console.error('[DEBUG] NFT scan error:', err);
    res.status(500).json({ detail: String(err) });
  }
});
