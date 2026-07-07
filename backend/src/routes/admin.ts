import { Router, Request, Response } from 'express';
import { Stake } from '../models/Stake';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getHoldingMultiplier, computeTotalActiveSeconds, computePoints } from '../services/staking';
import { config } from '../config';

const router = Router();

/**
 * Check if the authenticated address is an admin.
 * Admins are configured via ADMIN_ADDRESSES env var (comma-separated).
 * If no admin addresses are configured, all access is denied.
 */
function isAdmin(address: string): boolean {
  if (!config.adminAddresses || config.adminAddresses.length === 0) {
    return false;
  }
  return config.adminAddresses.includes(address.toLowerCase());
}

/**
 * Require admin. Returns 403 if not admin.
 */
function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.address) {
    res.status(401).json({ detail: 'Authentication required' });
    return false;
  }
  if (!isAdmin(req.address)) {
    res.status(403).json({ detail: 'Admin access required' });
    return false;
  }
  return true;
}

// ─── GET /api/admin/stats ───────────────────────────────────────
// Admin only: global staking statistics
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const allStakes = await Stake.find({}, { address: 1, status: 1, total_staked_seconds: 1, current_session_start: 1, _id: 0 }).lean();

    const uniqueUsers = new Set(allStakes.map((s) => s.address)).size;
    const totalStakes = allStakes.length;
    const activeStakes = allStakes.filter(
      (s) => s.status === 'active'
    ).length;

    // Group by address to compute per-user holding multiplier
    const now = new Date();
    const addressActiveCount = new Map<string, number>();
    for (const s of allStakes) {
      if (s.status === 'active') {
        addressActiveCount.set(s.address, (addressActiveCount.get(s.address) || 0) + 1);
      }
    }

    let totalPoints = 0.0;
    for (const s of allStakes) {
      const nftCount = addressActiveCount.get(s.address) || 0;
      const mult = getHoldingMultiplier(nftCount);
      const totalSec = computeTotalActiveSeconds(s as unknown as import('../models/Stake').IStake, now);
      const { points } = computePoints(s as unknown as import('../models/Stake').IStake, mult, now);
      totalPoints += points;
    }

    res.json({
      total_users: uniqueUsers,
      total_stakes: totalStakes,
      total_active_stakes: activeStakes,
      total_points_distributed: Math.round(totalPoints),
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ detail: 'Failed to load stats' });
  }
});

export default router;
