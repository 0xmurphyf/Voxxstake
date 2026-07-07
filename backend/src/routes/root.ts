import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Profile } from '../models/Profile';
import { Stake } from '../models/Stake';
import { Nonce } from '../models/Nonce';

const router = Router();

// ─── Root terminal: CLASSIFIED "FILE Z" data viewer ────────────
// Access is gated by a clearance password that lives ONLY in the
// ROOT_TERMINAL_PASSWORD env var (server-side). It is NEVER shipped to the
// client, so the SPA bundle / HTML contains no secret to extract.

const ROOT_TOKEN_TTL_SECONDS = 15 * 60; // 15-minute short-lived token
const ROOT_MAX_ATTEMPTS = 5;
const ROOT_LOCK_WINDOW_MS = 15 * 60 * 1000;

// Per-IP failure tracking (single-instance in-memory; sufficient for Railway
// single replica — same limitation as the existing auth throttle).
const rootFailures = new Map<string, { count: number; windowStart: number }>();

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Constant-time string comparison. Length mismatch does not short-circuit the
// timing-sensitive op (we always compare equal-length buffers), so it does not
// leak the expected length beyond the final boolean.
function safeEqual(a: string, b: string | null): boolean {
  if (b === null) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const sameLen = ab.length === bb.length;
  // Compare against a zero buffer of equal length when lengths differ, so the
  // timingSafeEqual call always runs on equal-length inputs (no length leak).
  const eq = crypto.timingSafeEqual(ab, sameLen ? bb : Buffer.alloc(ab.length));
  return sameLen && eq;
}

// Send JSON without ever throwing (a client that disconnected mid-response can
// make res.json throw EPIPE). We also refuse to send a second response, which
// would otherwise crash the process via ERR_HTTP_HEADERS_SENT.
function safeJson(res: Response, status: number, body: unknown): void {
  if (res.headersSent || res.writableEnded) return;
  try {
    res.status(status).json(body);
  } catch {
    // Client gone (EPIPE) or socket closed — nothing more we can do.
  }
}

// ─── POST /api/root/auth ───────────────────────────────────────
// Body: { password }. Returns { ok:true, token } on success, else { ok:false }.
router.post('/auth', async (req: Request, res: Response) => {
  try {
    if (!config.rootTerminalPassword) {
      // Fail closed if the password is not configured server-side.
      safeJson(res, 503, { ok: false, detail: 'Root terminal disabled' });
      return;
    }

    const ip = clientIp(req);
    const now = Date.now();
    const rec = rootFailures.get(ip);
    if (rec && now - rec.windowStart < ROOT_LOCK_WINDOW_MS && rec.count >= ROOT_MAX_ATTEMPTS) {
      safeJson(res, 429, { ok: false, detail: 'Too many attempts. Try again later.' });
      return;
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || !safeEqual(password, config.rootTerminalPassword)) {
      const cur = rootFailures.get(ip) || { count: 0, windowStart: now };
      if (now - cur.windowStart >= ROOT_LOCK_WINDOW_MS) {
        cur.count = 0;
        cur.windowStart = now;
      }
      cur.count += 1;
      rootFailures.set(ip, cur);
      safeJson(res, 401, { ok: false, detail: 'Invalid clearance code' });
      return;
    }

    // Success — reset failure counter and issue a short-lived root token.
    rootFailures.delete(ip);
    const issuedAt = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { root: true, iat: issuedAt, exp: issuedAt + ROOT_TOKEN_TTL_SECONDS },
      config.jwtSecret,
      { algorithm: 'HS256' }
    );
    safeJson(res, 200, { ok: true, token, expires_in: ROOT_TOKEN_TTL_SECONDS });
  } catch (err) {
    console.error('Root auth error:', err);
    safeJson(res, 500, { ok: false, detail: 'Auth failed' });
  }
});

// ─── GET /api/root/query ───────────────────────────────────────
// Requires the root JWT (Authorization: Bearer <token>).
// Read-only, whitelisted views with capped limits and an escaped address
// search. No arbitrary query execution — only safe, predefined projections.
interface ViewDef {
  model: any; // whitelisted set below; projection is fixed, so dynamic dispatch is safe
  projection: Record<string, 1>;
}
const VIEWS: Record<string, ViewDef> = {
  profiles: {
    model: Profile,
    projection: { address: 1, name: 1, pfp_object_id: 1, last_ip: 1, last_seen_at: 1, updated_at: 1, _id: 1 },
  },
  stakes: {
    model: Stake,
    projection: {
      address: 1, object_id: 1, status: 1, locked_points: 1,
      session_multiplier: 1, total_staked_seconds: 1, current_session_start: 1,
      last_synced: 1, _id: 1,
    },
  },
  nonces: {
    model: Nonce,
    projection: { address: 1, used: 1, created_at: 1, _id: 1 },
  },
};

function requireRoot(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    safeJson(res, 401, { detail: 'Missing authorization' });
    return false;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { root?: boolean };
    if (!payload.root) {
      safeJson(res, 403, { detail: 'Insufficient clearance' });
      return false;
    }
    return true;
  } catch {
    safeJson(res, 401, { detail: 'Invalid or expired token' });
    return false;
  }
}

router.get('/query', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;

  const view = String(req.query.view || '');
  const def = VIEWS[view];
  if (!def) {
    safeJson(res, 400, { detail: `Unknown view. Allowed: ${Object.keys(VIEWS).join(', ')}` });
    return;
  }

  // Clamp + validate pagination
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 100);
  const skip = Math.max(parseInt(String(req.query.skip || '0'), 10) || 0, 0);

  // Escaped address search (prevents regex/ReDoS injection)
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const filter: Record<string, unknown> = {};
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.address = { $regex: escaped, $options: 'i' };
  }

  try {
    const rows = await def.model
      .find(filter, def.projection)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    safeJson(res, 200, { view, count: rows.length, limit, skip, rows });
  } catch (err) {
    console.error('Root query error:', err);
    safeJson(res, 500, { detail: 'Query failed' });
  }
});

export default router;
