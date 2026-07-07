import { Router, Response, Request } from 'express';
import { Visitor } from '../models/Visitor';

const router = Router();

/**
 * Resolve a client IP from the request, accounting for Railway/nginx proxies.
 * Checks x-forwarded-for, x-real-ip, then falls back to req.ip / req.socket.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp.trim();
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/**
 * GET /api/visitor/count
 * Increment the global visitor counter and return the new count.
 * Public — no auth required.
 */
router.get('/count', async (_req: Request, res: Response) => {
  try {
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

/**
 * GET /api/visitor/location
 * Return the client's IP and a best-effort geolocation label.
 * Uses ipapi.co (free, no key needed) to resolve city/country.
 * Public — no auth required.
 */
router.get('/location', async (req: Request, res: Response) => {
  try {
    const ip = getClientIp(req);

    // Try ipapi.co for geolocation (free tier: 1000 req/day)
    let label = 'UNKNOWN NODE';
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (geoRes.ok) {
        const geo = (await geoRes.json()) as Record<string, string>;
        if (geo.city && geo.country_code) {
          label = `${geo.city.toUpperCase()}, ${geo.country_code}`;
        } else if (geo.country_name) {
          label = geo.country_name.toUpperCase();
        }
      }
    } catch {
      // Geolocation failed — fall back to IP alone
      label = ip.includes(':') ? ip.split(':').slice(0, 2).join(':') + '…' : ip;
    }

    res.json({ ip, label });
  } catch (err) {
    console.error('Visitor location error:', err);
    res.json({ ip: 'unknown', label: 'UNKNOWN NODE' });
  }
});

export default router;
