import { Router, Request, Response } from 'express';
import { Stake } from '../models/Stake';
import { Tier } from '../models/Tier';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { DEFAULT_TIERS } from '../services/staking';

const router = Router();

/**
 * Check if address is admin (currently allows all — matches Python behavior).
 */
function isAdmin(_address: string): boolean {
  return true;
}

// ─── GET /api/admin/tiers ───────────────────────────────────────
router.get('/tiers', async (_req: Request, res: Response) => {
  try {
    const tiers = await Tier.find({}).lean();

    if (!tiers || tiers.length === 0) {
      res.json({ tiers: DEFAULT_TIERS });
      return;
    }

    res.json({ tiers });
  } catch (err) {
    console.error('Get tiers error:', err);
    res.status(500).json({ detail: 'Failed to load tiers' });
  }
});

// ─── POST /api/admin/tiers ──────────────────────────────────────
router.post('/tiers', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    if (!isAdmin(address)) {
      res.status(403).json({ detail: 'Admin access required' });
      return;
    }

    const { tiers } = req.body;
    if (!tiers || !Array.isArray(tiers)) {
      res.status(400).json({ detail: 'tiers array is required' });
      return;
    }

    // Replace all tiers
    await Tier.deleteMany({});
    if (tiers.length > 0) {
      await Tier.insertMany(tiers);
    }

    const updated = await Tier.find({}).lean();
    res.json({ tiers: updated.length > 0 ? updated : DEFAULT_TIERS });
  } catch (err) {
    console.error('Update tiers error:', err);
    res.status(500).json({ detail: 'Failed to update tiers' });
  }
});

// ─── GET /api/admin/stats ───────────────────────────────────────
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const address = req.address!;
    if (!isAdmin(address)) {
      res.status(403).json({ detail: 'Admin access required' });
      return;
    }

    const allStakes = await Stake.find({}, { address: 1, status: 1, _id: 0 }).lean();

    const uniqueUsers = new Set(allStakes.map((s) => s.address)).size;
    const totalStakes = allStakes.length;
    const activeStakes = allStakes.filter(
      (s) => s.status === 'active'
    ).length;

    // Sum points from all stakes
    const tiers = await Tier.find({}).lean();
    const tierList = tiers.length > 0 ? tiers : DEFAULT_TIERS;
    let totalPoints = 0.0;
    const now = new Date();

    for (const s of allStakes) {
      let totalSec = s.total_staked_seconds || 0.0;
      if (s.status === 'active' && s.current_session_start) {
        const sessionStart = new Date(s.current_session_start);
        totalSec += Math.max(0.0, (now.getTime() - sessionStart.getTime()) / 1000);
      }
      const durationDays = totalSec / 86400;
      const sorted = [...tierList].sort((a, b) => b.min_days - a.min_days);
      let mult = sorted[sorted.length - 1]?.multiplier || 1.0;
      for (const t of sorted) {
        if (durationDays >= t.min_days) {
          mult = t.multiplier;
          break;
        }
      }
      totalPoints += durationDays * 10.0 * mult;
    }

    res.json({
      total_users: uniqueUsers,
      total_stakes: totalStakes,
      total_active_stakes: activeStakes,
      total_points_distributed: totalPoints,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ detail: 'Failed to load stats' });
  }
});

export default router;
