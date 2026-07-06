import { Router, Request, Response } from 'express';
import { Stake } from '../models/Stake';
import { Profile } from '../models/Profile';
import { computeTotalActiveSeconds, computePoints, getHoldingMultiplier } from '../services/staking';
import { IStake } from '../models/Stake';

const router = Router();

/**
 * Format address to a short display name.
 * If the user has set a profile name, show "Name (0xABC...)".
 * Otherwise show "0xABC...".
 */
function formatDisplayName(address: string, profileName?: string | null): string {
  const short = `0x${address.slice(2, 5)}`;
  if (profileName && profileName.trim()) {
    return `${profileName.trim()} (${short})`;
  }
  return short;
}

/**
 * GET /api/ranking
 *
 * Public endpoint — no auth required.
 * Returns all active stakers ranked by total citizenship credits, with:
 *   - display_name (profile name + short address, or just short address)
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

    // Fetch all profiles for display names (batch query)
    const addressList = Array.from(byAddress.keys());
    const profiles = await Profile.find({ address: { $in: addressList } }).lean();
    const nameMap = new Map<string, string | null>();
    for (const p of profiles) {
      nameMap.set(p.address, p.name || null);
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
        display_name: formatDisplayName(address, nameMap.get(address)),
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
