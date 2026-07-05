import { Router, Request, Response } from 'express';
import { Stake } from '../models/Stake';
import { computeTotalActiveSeconds, computePoints, getHoldingMultiplier } from '../services/staking';
import { IStake } from '../models/Stake';

const router = Router();

/**
 * GET /api/ranking
 *
 * Public endpoint — no auth required.
 * Returns all active stakers ranked by total citizenship credits, with:
 *   - address (masked for privacy)
 *   - credential count
 *   - holding multiplier
 *   - total credits
 *   - registration duration (longest active credential)
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    // Get all active stakes grouped by address
    const allStakes = await Stake.find({ status: 'active' }).lean();

    // Group by address
    const byAddress = new Map<string, IStake[]>();
    for (const stake of allStakes) {
      const s = stake as unknown as IStake;
      const existing = byAddress.get(s.address) || [];
      existing.push(s);
      byAddress.set(s.address, existing);
    }

    // Build ranking entries
    const entries = Array.from(byAddress.entries()).map(([address, stakes]) => {
      const nftCount = stakes.length;
      const multiplier = getHoldingMultiplier(nftCount);

      let totalCredits = 0;
      let maxDurationDays = 0;

      for (const stake of stakes) {
        const totalSec = computeTotalActiveSeconds(stake, now);
        const { points, durationDays } = computePoints(totalSec, multiplier);
        totalCredits += points;
        if (durationDays > maxDurationDays) maxDurationDays = durationDays;
      }

      return {
        address: `${address.slice(0, 8)}...${address.slice(-6)}`,
        credential_count: nftCount,
        multiplier,
        total_credits: totalCredits,
        max_duration_days: maxDurationDays,
      };
    });

    // Sort by total credits descending
    entries.sort((a, b) => b.total_credits - a.total_credits);

    res.json({
      total_stakers: entries.length,
      rankings: entries,
    });
  } catch (err) {
    console.error('Ranking error:', err);
    res.status(500).json({ detail: 'Failed to load rankings' });
  }
});

export default router;
