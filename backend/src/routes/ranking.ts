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
 * GET /api/ranking?address=<optional>
 *
 * Public endpoint — no auth required.
 * Returns ALL applicants from the Profile collection (every authenticated
 * user), merged with Stake data for credits/NFT counts.
 * Users who authenticated but never held an NFT appear with 0 credits.
 * Ranked by total citizenship credits (0-credit users at the bottom).
 *
 * If ?address= is provided, the response includes current_user_rank.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const queryAddress = (req.query.address as string || '').toLowerCase();

    // 1. Get ALL profiles — every user who ever authenticated
    const allProfiles = await Profile.find({}).lean();
    const nameMap = new Map<string, string | null>();
    for (const p of allProfiles) {
      nameMap.set(p.address.toLowerCase(), p.name || null);
    }

    // 2. Get ALL stakes (active + paused)
    const allStakes = await Stake.find({}).lean();

    // Group stakes by address
    const stakesByAddress = new Map<string, IStake[]>();
    for (const stake of allStakes) {
      const s = stake as unknown as IStake;
      const key = s.address.toLowerCase();
      const existing = stakesByAddress.get(key) || [];
      existing.push(s);
      stakesByAddress.set(key, existing);
    }

    // 3. Build entries: start from profiles (every authenticated user)
    const entries = allProfiles.map(p => {
      const address = p.address.toLowerCase();
      const stakes = stakesByAddress.get(address) || stakesByAddress.get(p.address) || [];
      const activeStakes = stakes.filter(s => s.status === 'active');
      const nftCount = activeStakes.length;
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
        address,
        display_address: `${address.slice(0, 8)}...${address.slice(-6)}`,
        display_name: formatDisplayName(address, nameMap.get(address)),
        credential_count: nftCount,
        multiplier,
        total_credits: totalCredits,
        max_duration_days: maxDurationDays,
      };
    });

    // 4. Also include any stake addresses NOT in Profile (edge case: legacy data)
    const profileAddresses = new Set(allProfiles.map(p => p.address.toLowerCase()));
    for (const [address, stakes] of stakesByAddress) {
      if (profileAddresses.has(address)) continue;
      const activeStakes = stakes.filter(s => s.status === 'active');
      const nftCount = activeStakes.length;
      const multiplier = getHoldingMultiplier(nftCount);

      let totalCredits = 0;
      let maxDurationDays = 0;
      for (const stake of stakes) {
        const totalSec = computeTotalActiveSeconds(stake, now);
        const { points, durationDays } = computePoints(totalSec, multiplier);
        totalCredits += points;
        if (durationDays > maxDurationDays) maxDurationDays = durationDays;
      }

      entries.push({
        address,
        display_address: `${address.slice(0, 8)}...${address.slice(-6)}`,
        display_name: formatDisplayName(address, null),
        credential_count: nftCount,
        multiplier,
        total_credits: totalCredits,
        max_duration_days: maxDurationDays,
      });
    }

    // 5. Sort by total credits descending (0-credit users sink to bottom)
    entries.sort((a, b) => b.total_credits - a.total_credits);

    // 6. Find current user's rank if address provided
    let currentUserRank: number | null = null;
    if (queryAddress) {
      const idx = entries.findIndex(e => e.address === queryAddress);
      currentUserRank = idx >= 0 ? idx + 1 : null;
    }

    // Strip full address from public response
    const publicEntries = entries.map(({ address: _a, ...rest }) => rest);

    res.json({
      total_stakers: entries.length,
      current_user_rank: currentUserRank,
      rankings: publicEntries,
    });
  } catch (err) {
    console.error('Ranking error:', err);
    res.status(500).json({ detail: 'Failed to load rankings' });
  }
});

export default router;
