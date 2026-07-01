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

const router = Router();

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

// ─── GET /api/staking/cached ───────────────────────────────────
router.get('/cached', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    const tiers = await loadTiers();

    const stakes = await Stake.find({ address }).lean();
    const positions = stakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, tiers, null)
    );

    const stats = buildStatsFromPositions(positions, []);
    res.json(stats);
  } catch (err) {
    console.error('Cached stakes error:', err);
    res.status(500).json({ detail: 'Failed to load cached stakes' });
  }
});

// ─── POST /api/staking/sync ────────────────────────────────────
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    const tiers = await loadTiers();
    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch owned NFTs from chain (lite mode)
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
          // Resume paused stake
          existing.status = 'active';
          existing.current_session_start = nowIso;
          existing.name = meta.name;
          existing.image_url = meta.image_url;
          existing.last_synced = nowIso;
          await existing.save();
        } else {
          // Update metadata
          existing.name = meta.name;
          existing.image_url = meta.image_url;
          existing.last_synced = nowIso;
          await existing.save();
        }
      } else {
        // Create new stake
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

    // 2) Pause stakes for NFTs no longer in wallet
    for (const [objId, stake] of existingMap) {
      if (!ownedMap.has(objId) && stake.status === 'active') {
        let sessionSeconds = 0.0;
        if (stake.current_session_start) {
          const sessionStart = new Date(stake.current_session_start);
          sessionSeconds = Math.max(
            0.0,
            (now.getTime() - sessionStart.getTime()) / 1000
          );
        }
        stake.status = 'paused';
        stake.current_session_start = null;
        stake.total_staked_seconds = (stake.total_staked_seconds || 0.0) + sessionSeconds;
        stake.last_synced = nowIso;
        await stake.save();
        sellAlerts.push(stake.name || `VOXX #${objId.slice(-6)}`);
      }
    }

    // 3) Build response from fresh DB state
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
    res.json(stats);
  } catch (err) {
    console.error('Sync stakes error:', err);
    res.status(500).json({ detail: 'Failed to sync stakes' });
  }
});

// ─── GET /api/staking/positions ─────────────────────────────────
router.get('/positions', authMiddleware, async (req: AuthRequest, res: Response) => {
  // Forward to sync logic (backward-compat)
  try {
    const address = req.address!;
    const tiers = await loadTiers();
    const now = new Date();
    const nowIso = now.toISOString();

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

    for (const [objId, meta] of ownedMap) {
      const existing = existingMap.get(objId);
      if (existing) {
        if (existing.status === 'paused') {
          existing.status = 'active';
          existing.current_session_start = nowIso;
          existing.name = meta.name;
          existing.image_url = meta.image_url;
          existing.last_synced = nowIso;
          await existing.save();
        } else {
          existing.name = meta.name;
          existing.image_url = meta.image_url;
          existing.last_synced = nowIso;
          await existing.save();
        }
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

    const freshStakes = await Stake.find({ address }).lean();
    const ownedSet = new Set(ownedMap.keys());
    const positions = freshStakes.map((s) =>
      buildPositionFromStake(s as unknown as import('../models/Stake').IStake, tiers, ownedSet)
    );

    const stats = buildStatsFromPositions(positions, sellAlerts);
    res.json(stats);
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
