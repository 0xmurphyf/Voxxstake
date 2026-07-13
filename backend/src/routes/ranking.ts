import { Router, Request, Response } from 'express';
import { Stake } from '../models/Stake';
import { Profile } from '../models/Profile';
import { computeTotalActiveSeconds, computePoints, getHoldingMultiplier } from '../services/staking';
import { IStake } from '../models/Stake';

const router = Router();

// ─── Per-IP rate limit for the public ranking endpoint ─────────
// Prevents an unauthenticated attacker from paging through the entire user
// base cheaply to harvest display names / truncated addresses (enumeration).
// Single-instance in-memory (sufficient for Railway single replica).
const RANKING_MIN_INTERVAL_MS = 1500;
const rankingLastSeen = new Map<string, number>();

function rankingThrottle(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const last = rankingLastSeen.get(ip) || 0;
  if (now - last < RANKING_MIN_INTERVAL_MS) {
    res
      .status(429)
      .json({ detail: 'Too many ranking requests, slow down.', retry_after_seconds: Math.ceil(RANKING_MIN_INTERVAL_MS / 1000) });
    return false;
  }
  rankingLastSeen.set(ip, now);
  if (rankingLastSeen.size % 200 === 0) {
    const cutoff = now - RANKING_MIN_INTERVAL_MS * 4;
    for (const [k, v] of rankingLastSeen) if (v < cutoff) rankingLastSeen.delete(k);
  }
  return true;
}

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
    if (!rankingThrottle(req, res)) return;

    const now = new Date();
    // Reject non-string address params (e.g. ?address[$ne]=null from NoSQL injection
    // attempts). Express qs parser turns those into objects; .toLowerCase() on them
    // throws TypeError → 500, which is a DoS vector. Catch it early.
    const rawAddress = req.query.address;
    if (rawAddress !== undefined && typeof rawAddress !== 'string') {
      res.status(400).json({ detail: 'Invalid address parameter' });
      return;
    }
    const queryAddress = (rawAddress as string || '').toLowerCase();

    // Pagination (clamped) so a single request can't dump the whole user base.
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const skip = Math.max(parseInt(String(req.query.skip || '0'), 10) || 0, 0);

    // 1. Get ALL profiles — every user who ever authenticated.
    //    NOTE: this loads the full collections into memory. For a small-to-medium
    //    user base (<10k) this is fine. If the user base grows significantly,
    //    replace with a MongoDB aggregation pipeline that pre-computes credits
    //    via $lookup + $group + $addFields, then $sort + $skip + $limit in the DB
    //    layer to avoid memory pressure.
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
        const { points, durationDays } = computePoints(stake as unknown as IStake, multiplier, now);
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
        const { points, durationDays } = computePoints(stake as unknown as IStake, multiplier, now);
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

    // 6. Find current user's rank if address provided.
    //    To prevent address enumeration (an oracle that reveals whether a given
    //    Sui address has ever authenticated), unregistered addresses get a fake
    //    rank of total_stakers+1 instead of null. This way the response looks
    //    identical whether the address exists or not.
    let currentUserRank: number | null = null;
    if (queryAddress) {
      const idx = entries.findIndex(e => e.address === queryAddress);
      currentUserRank = idx >= 0 ? idx + 1 : entries.length + 1;
    }

    // Strip full address from public response
    const publicEntries = entries.map(({ address: _a, ...rest }) => rest);

    // Slice to the requested page. current_user_rank above is computed over the
    // FULL sorted set, so it stays accurate regardless of pagination.
    const pageEntries = publicEntries.slice(skip, skip + limit);

    res.json({
      total_stakers: entries.length,
      current_user_rank: currentUserRank,
      rankings: pageEntries,
      limit,
      skip,
    });
  } catch (err) {
    console.error('Ranking error:', err);
    res.status(500).json({ detail: 'Failed to load rankings' });
  }
});

export default router;
