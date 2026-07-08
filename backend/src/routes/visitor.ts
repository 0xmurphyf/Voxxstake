import { Router, Response, Request } from 'express';
import { Visitor } from '../models/Visitor';

const router = Router();

// Per-IP throttle so the public counter can't be trivially inflated / abused.
const visitorRateLimit = new Map<string, number>();
const VISITOR_MIN_INTERVAL_MS = 2000;

// Trust req.ip (derived from the trusted proxy via app.set('trust proxy', 1)),
// NOT x-forwarded-for which a client can freely spoof. A spoofable IP would let
// the public counter be inflated by resetting the per-IP throttle each request.
function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * GET /api/visitor/count
 * Increment the global visitor counter and return the new count.
 * Public — no auth required, but throttled per client IP.
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const ip = clientIp(req);
    const now = Date.now();
    const last = visitorRateLimit.get(ip) || 0;

    if (now - last < VISITOR_MIN_INTERVAL_MS) {
      // Too frequent — return current count without incrementing.
      const doc = await Visitor.findOne({ _key: 'global' }).lean();
      res.json({ count: doc?.count || 0 });
      return;
    }

    visitorRateLimit.set(ip, now);
    // Periodic cleanup of stale entries.
    if (visitorRateLimit.size > 10000) {
      for (const [k, t] of visitorRateLimit) {
        if (now - t > 60000) visitorRateLimit.delete(k);
      }
    }

    const doc = await Visitor.findOneAndUpdate(
      { _key: 'global' },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    ).lean();

    res.json({ count: doc?.count || 1 });
  } catch (err) {
    console.error('Visitor count error:', err);
    res.json({ count: 0, error: 'Failed to update counter' });
  }
});

export default router;
