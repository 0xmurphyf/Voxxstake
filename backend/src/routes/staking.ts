import { Router, Response } from 'express';
import { Stake } from '../models/Stake';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getOwnedObjects, getNftMetadata, extractImageUrl, extractNftName } from '../services/sui';
import {
  buildPositionFromStake,
  buildStatsFromPositions,
  computeTotalActiveSeconds,
  computePoints,
  getHoldingMultiplier,
} from '../services/staking';
import { VOXX_TYPE, POINTS_PER_NFT_PER_HOUR } from '../types';
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
 * Sync helper: for a given address, pull chain data and update DB.
 * Returns { ownedMap, sellAlerts }.
 */
async function syncStakesForAddress(
  address: string
): Promise<{ ownedMap: Map<string, { name: string; image_url: string | null }>; sellAlerts: string[] }> {
  const now = new Date();
  const nowIso = now.toISOString();

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

  const existingStakes = await Stake.find({ address });
  const existingMap = new Map(existingStakes.map((s) => [s.object_id, s]));
  const sellAlerts: string[] = [];

  // Current holding multiplier for the user (based on owned NFT count).
  const currentNftCount = ownedMap.size;
  const currentMultiplier = getHoldingMultiplier(currentNftCount);

  // 1) For each owned NFT: ensure active stake
  for (const [objId, meta] of ownedMap) {
    const existing = existingMap.get(objId);
    if (existing) {
        if (existing.status === 'paused') {
          // Resume: re-bought the same NFT
          existing.status = 'active';
          existing.current_session_start = nowIso;
          existing.session_multiplier = currentMultiplier;
          existing.name = meta.name;
          existing.image_url = meta.image_url;
          existing.last_synced = nowIso;
          await existing.save();
        } else {
          // Update metadata + sync timestamp, and only ever increase the
          // frozen session multiplier so live credits never decrease.
          const prevMult =
            typeof existing.session_multiplier === 'number' && existing.session_multiplier > 0
              ? existing.session_multiplier
              : 1.0;
          if (prevMult < currentMultiplier) existing.session_multiplier = currentMultiplier;
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
          session_multiplier: currentMultiplier,
          last_synced: nowIso,
        });
    }
  }

  // 2) Pause stakes for NFTs no longer in wallet.
  //    BUT: if Kiosk scan had an error, skip pausing — we might have missed
  //    Kiosk-owned NFTs due to RPC flakiness. They'll be cleaned up next round.
  if (!kioskError) {
    // currentNftCount / currentMultiplier already computed above for the
    // whole address; reuse them when locking points.
    for (const [objId, stake] of existingMap) {
      if (!ownedMap.has(objId) && stake.status === 'active') {
        let sessionSeconds = 0.0;
        if (stake.current_session_start) {
          const sessionStart = new Date(stake.current_session_start);
          sessionSeconds = Math.max(0.0, (now.getTime() - sessionStart.getTime()) / 1000);
        }
        // Lock current session's points at the FROZEN session multiplier
        // (never lower than what was displayed while active) so credits
        // never decrease when the global multiplier drops after a sale.
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
        sellAlerts.push(stake.name || `VOXX #${objId.slice(-6)}`);
      }
    }
  } else if (existingMap.size > 0 && ownedMap.size === 0) {
    // Kiosk scan failed AND we found zero direct NFTs, but DB has records.
    // This is suspicious — log a warning and skip pausing.
    console.warn(`[Sync] Kiosk scan failed for ${address.slice(0, 10)}... — 0 direct NFTs found, ${existingMap.size} DB stakes preserved`);
  }

  return { ownedMap, sellAlerts };
}

// ─── GET /api/staking/cached ───────────────────────────────────
// Fast DB-only read.
router.get('/cached', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;

    const stakes = await Stake.find({ address }).lean();
    const nftCount = stakes.filter(s => s.status === 'active').length;
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
    const nftCount = ownedMap.size;
    const holdingMultiplier = getHoldingMultiplier(nftCount);

    const freshStakes = await Stake.find({ address }).lean();
    const ownedSet = new Set(ownedMap.keys());
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(
        s as unknown as import('../models/Stake').IStake,
        holdingMultiplier,
        ownedSet
      )
    );

    const stats = buildStatsFromPositions(positions, sellAlerts, nftCount, holdingMultiplier);
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
      const stakes = await Stake.find({ address }).lean();
      const nftCount = stakes.filter(s => s.status === 'active').length;
      const holdingMultiplier = getHoldingMultiplier(nftCount);
      const ownedSet = new Set(stakes.filter(s => s.status === 'active').map(s => s.object_id));
      const positions = stakes.map((s) =>
        buildPositionFromStake(s as unknown as import('../models/Stake').IStake, holdingMultiplier, ownedSet)
      );
      const stats = buildStatsFromPositions(positions, [], nftCount, holdingMultiplier);
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
    const nftCount = ownedMap.size;
    const holdingMultiplier = getHoldingMultiplier(nftCount);

    const freshStakes = await Stake.find({ address }).lean();
    const ownedSet = new Set(ownedMap.keys());
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, holdingMultiplier, ownedSet)
    );

    const stats = buildStatsFromPositions(positions, sellAlerts, nftCount, holdingMultiplier);
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

export default router;

// ─── DEBUG: GET /api/staking/debug/nfts?address=... ──────────────
router.get('/debug/nfts', async (req: AuthRequest, res: Response) => {
  const { address } = req.query as { address?: string };
  if (!address) {
    res.status(400).json({ detail: 'Missing ?address= query param' });
    return;
  }
  try {
    const { objects: nfts } = await getOwnedObjects(address, VOXX_TYPE, true);
    res.json({ address, count: nfts.length, nfts: nfts.slice(0, 5) });
  } catch (err) {
    console.error('[DEBUG] NFT scan error:', err);
    res.status(500).json({ detail: String(err) });
  }
});
