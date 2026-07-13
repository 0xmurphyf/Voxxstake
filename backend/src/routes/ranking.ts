import { Router, Request, Response } from 'express';
import { RankingSnapshot } from '../models/RankingSnapshot';
import { createThrottle } from '../services/throttle';

const router = Router();

// ─── Per-IP rate limit for the public ranking endpoint ─────────
// Prevents an unauthenticated attacker from paging through the entire user
// base cheaply to harvest display names / truncated addresses (enumeration).
// Single-instance in-memory (sufficient for Railway single replica).
const RANKING_MIN_INTERVAL_MS = 1500;
const rankingThrottleGuard = createThrottle({ minIntervalMs: RANKING_MIN_INTERVAL_MS });

function rankingThrottle(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!rankingThrottleGuard.allow(ip)) {
    res
      .status(429)
      .json({ detail: 'Too many ranking requests, slow down.', retry_after_seconds: Math.ceil(RANKING_MIN_INTERVAL_MS / 1000) });
    return false;
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
 * GET /api/ranking?address=<optional>&limit=100&skip=0
 *
 * Public endpoint — no auth required.
 * Reads from the precomputed RankingSnapshot collection (rebuilt by
 * backgroundSync every cycle), so response time is a single indexed
 * MongoDB query regardless of user count — no full-table scans.
 *
 * If ?address= is provided, the response includes current_user_rank.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!rankingThrottle(req, res)) return;

    // Reject non-string address params
    const rawAddress = req.query.address;
    if (rawAddress !== undefined && typeof rawAddress !== 'string') {
      res.status(400).json({ detail: 'Invalid address parameter' });
      return;
    }
    const queryAddress = (rawAddress as string || '').toLowerCase();

    // Pagination (clamped)
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const skip = Math.max(parseInt(String(req.query.skip || '0'), 10) || 0, 0);

    // Total count (cached by index — fast)
    const totalStakers = await RankingSnapshot.countDocuments();

    // Page of rankings sorted by total_credits DESC (uses the compound index)
    const page = await RankingSnapshot
      .find({}, { _id: 0, address: 0, updated_at: 0 })
      .sort({ total_credits: -1, address: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Current user's rank if address provided.
    // Count documents with higher credits + same-credits-but-lower-address.
    let currentUserRank: number | null = null;
    if (queryAddress) {
      const user = await RankingSnapshot.findOne({ address: queryAddress }).lean();
      if (user) {
        const higherCount = await RankingSnapshot.countDocuments({
          $or: [
            { total_credits: { $gt: user.total_credits } },
            { total_credits: user.total_credits, address: { $lt: queryAddress } },
          ],
        });
        currentUserRank = higherCount + 1;
      } else {
        // Unregistered address — fake rank to prevent enumeration oracle
        currentUserRank = totalStakers + 1;
      }
    }

    res.json({
      total_stakers: totalStakers,
      current_user_rank: currentUserRank,
      rankings: page,
      limit,
      skip,
    });
  } catch (err) {
    console.error('Ranking error:', err);
    res.status(500).json({ detail: 'Failed to load rankings' });
  }
});

export default router;
