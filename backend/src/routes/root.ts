import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Profile } from '../models/Profile';
import { Stake } from '../models/Stake';
import { StakeSummary } from '../models/StakeSummary';
import { RankingSnapshot } from '../models/RankingSnapshot';
import { Nonce } from '../models/Nonce';
import { SyncReport, triggerAddressSync, triggerSync, rebuildRankingSnapshot } from '../services/backgroundSync';

const router = Router();

// ─── Root terminal: CLASSIFIED "FILE Z" data viewer ────────────
// Access is gated by a clearance password that lives ONLY in the
// ROOT_TERMINAL_PASSWORD env var (server-side). It is NEVER shipped to the
// client, so the SPA bundle / HTML contains no secret to extract.

const ROOT_TOKEN_TTL_SECONDS = 15 * 60; // 15-minute short-lived token
const ROOT_MAX_ATTEMPTS = 5;
const ROOT_LOCK_WINDOW_MS = 15 * 60 * 1000;

// Global failure tracking — NOT per-IP. Per-IP buckets are trivially bypassed
// by rotating source IPs (NAT pools, IPv6 /64, proxies). A single global counter
// means ANY 5 consecutive failures lock the terminal for everyone, which is the
// intended brute-force deterrent.
let rootFailureCount = 0;
let rootFailureWindowStart = 0;

// Trust req.ip (derived from the trusted proxy via app.set('trust proxy', 1)),
// NOT x-forwarded-for which a client can freely spoof. Spoofable IPs would let
// an attacker reset the per-IP brute-force counter on every request.
function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
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

    const now = Date.now();

    // Global lock: any 5 consecutive failures freeze the terminal for everyone.
    if (rootFailureCount >= ROOT_MAX_ATTEMPTS && now - rootFailureWindowStart < ROOT_LOCK_WINDOW_MS) {
      safeJson(res, 429, { ok: false, detail: 'Too many attempts. Try again later.' });
      return;
    }

    const { password } = req.body || {};
    if (typeof password !== 'string' || !safeEqual(password, config.rootTerminalPassword)) {
      // Reset or start the global failure window
      if (now - rootFailureWindowStart >= ROOT_LOCK_WINDOW_MS) {
        rootFailureCount = 0;
        rootFailureWindowStart = now;
      }
      rootFailureCount += 1;
      safeJson(res, 401, { ok: false, detail: 'Invalid clearance code' });
      return;
    }

    // Success — reset global failure counter and issue a short-lived root token.
    rootFailureCount = 0;
    rootFailureWindowStart = 0;
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
    // Pin the algorithm — same defense-in-depth as the user auth middleware.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { root?: boolean };
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

    // File Z should show the last complete on-chain scan, not the number of
    // historical Stake documents. Fall back to active stakes only for wallets
    // that have never completed a scan.
    if (view === 'profiles' && rows.length > 0) {
      const addresses = rows.map((r: any) => r.address);
      const [summaries, activeStakeCounts, rankingSnapshots, profiles] = await Promise.all([
        StakeSummary.find({ address: { $in: addresses } }).lean(),
        Stake.aggregate([
          { $match: { address: { $in: addresses }, status: 'active' } },
          { $group: { _id: '$address', nft_count: { $sum: 1 } } },
        ]),
        RankingSnapshot.find({ address: { $in: addresses } }).lean(),
        Profile.find({ address: { $in: addresses } }, 'address credit_override multiplier_override').lean(),
      ]);
      const summaryMap = new Map(summaries.map((summary) => [summary.address, summary.nft_count]));
      const activeCountMap = new Map<string, number>();
      for (const count of activeStakeCounts) {
        activeCountMap.set(count._id, count.nft_count);
      }
      const rankingMap = new Map(
        rankingSnapshots.map((r) => [r.address, { multiplier: r.multiplier, total_credits: r.total_credits }])
      );
      const profileMap = new Map(
        profiles.map((p) => [p.address, { credit_override: p.credit_override, multiplier_override: p.multiplier_override }])
      );
      for (const row of rows as any[]) {
        row.nft_count = summaryMap.get(row.address) ?? activeCountMap.get(row.address) ?? 0;
        const rank = rankingMap.get(row.address);
        row.multiplier = rank?.multiplier ?? 1.0;
        row.total_credits = rank?.total_credits ?? 0;
        const profOverride = profileMap.get(row.address);
        row.credit_override = profOverride?.credit_override ?? null;
        row.multiplier_override = profOverride?.multiplier_override ?? null;
      }
    }

    safeJson(res, 200, { view, count: rows.length, limit, skip, rows });
  } catch (err) {
    console.error('Root query error:', err);
    safeJson(res, 500, { detail: 'Query failed' });
  }
});

// ─── POST /api/root/sync ───────────────────────────────────────
// Trigger an immediate full background sync. Requires root JWT.
router.post('/sync', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;

  try {
    // Fire-and-forget — sync runs in background, we return immediately
    triggerSync().catch((err) => console.error('[root] Sync error:', err));
    safeJson(res, 200, { ok: true, detail: 'Sync triggered. Check server logs for progress.' });
  } catch (err) {
    console.error('Root sync trigger error:', err);
    safeJson(res, 500, { detail: 'Failed to trigger sync' });
  }
});

type FullScanJob = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  finished_at?: string;
  report?: SyncReport;
  error?: string;
  target_address?: string;
};

let fullScanJob: FullScanJob | null = null;

// ─── POST /api/root/full-scan ──────────────────────────────────
// Start an observable, complete chain scan. The client polls the status route
// so a long scan is not lost to an HTTP/proxy timeout.
router.post('/full-scan', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;

  const rawAddress = req.body?.address;
  const requestedAddress = typeof rawAddress === 'string' ? rawAddress.trim().toLowerCase() : '';
  if (rawAddress !== undefined && rawAddress !== '' && typeof rawAddress !== 'string') {
    safeJson(res, 400, { detail: 'Address must be a string' });
    return;
  }
  if (requestedAddress && !/^0x[0-9a-f]{64}$/.test(requestedAddress)) {
    safeJson(res, 400, { detail: 'Enter a complete 0x + 64 hex Sui address' });
    return;
  }

  if (fullScanJob?.status === 'running') {
    const sameTarget = (fullScanJob.target_address || '') === requestedAddress;
    if (sameTarget) {
      safeJson(res, 202, { ok: true, job: fullScanJob });
    } else {
      safeJson(res, 409, { detail: 'Another File Z scan is already running', job: fullScanJob });
    }
    return;
  }

  const job: FullScanJob = {
    id: crypto.randomUUID(),
    status: 'running',
    started_at: new Date().toISOString(),
    ...(requestedAddress ? { target_address: requestedAddress } : {}),
  };
  fullScanJob = job;

  const scanPromise = requestedAddress
    ? triggerAddressSync(requestedAddress)
    : triggerSync();

  scanPromise
    .then((report) => {
      // A few RPC failures should not hide successful wallet updates. Report a
      // hard failure only when nothing could be updated at all.
      job.status = report.errors > 0 && report.updated === 0 ? 'failed' : 'completed';
      job.report = report;
      job.finished_at = new Date().toISOString();
      if (report.errors > 0) {
        job.error = report.failures
          .map((failure) => `${failure.address}: ${failure.error}`)
          .join(' | ') || `${report.errors} address scan(s) failed`;
      }
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : 'Full scan failed';
      job.finished_at = new Date().toISOString();
    });

  safeJson(res, 202, { ok: true, job });
});

// ─── GET /api/root/full-scan ───────────────────────────────────
router.get('/full-scan', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;
  safeJson(res, 200, { ok: true, job: fullScanJob });
});

// ─── POST /api/root/adjust-credit ───────────────────────────────
// Adjust a user's total_credits and/or multiplier. Requires root JWT.
// Writes to Profile.credit_override / multiplier_override so the
// adjustment survives sync cycles (rebuildRankingSnapshot reads them).
// Body: { address, credit_delta?: number, multiplier_delta?: number, clear?: boolean }
// - credit_delta: positive to add, negative to reduce (accumulated in credit_override)
// - multiplier_delta: delta added to auto-computed multiplier (e.g. 0.5 adds 0.5x, -0.1 subtracts 0.1x)
// - clear: if true, reset both overrides to null
router.post('/adjust-credit', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;

  const { address, credit_delta, multiplier_delta, multiplier, clear } = req.body || {};
  // Backward compat: accept `multiplier` as alias for `multiplier_delta`
  const multDelta = multiplier_delta ?? multiplier;
  if (!address || typeof address !== 'string') {
    safeJson(res, 400, { detail: 'address is required' });
    return;
  }

  const addr = address.toLowerCase();

  try {
    const profile = await Profile.findOne({ address: addr });
    if (!profile) {
      safeJson(res, 404, { detail: 'Address not found. User must log in first.' });
      return;
    }

    const changes: string[] = [];

    if (clear) {
      // Reset all overrides
      const hadCredit = profile.credit_override != null;
      const hadMult = profile.multiplier_override != null;
      profile.credit_override = null;
      profile.multiplier_override = null;
      await profile.save();
      if (hadCredit) changes.push('credit_override: cleared');
      if (hadMult) changes.push('multiplier_override: cleared');
      if (!hadCredit && !hadMult) changes.push('no overrides to clear');
    } else {
      const hasCredit = typeof credit_delta === 'number' && credit_delta !== 0;
      const hasMult = typeof multDelta === 'number' && multDelta !== 0;
      if (!hasCredit && !hasMult) {
        safeJson(res, 400, { detail: 'credit_delta (number), multiplier_delta (number), or clear (bool) is required' });
        return;
      }

      if (hasCredit) {
        const oldOverride = profile.credit_override || 0;
        profile.credit_override = oldOverride + credit_delta;
        await profile.save();
        changes.push(`credit_override: ${oldOverride} → ${profile.credit_override} (${credit_delta >= 0 ? '+' : ''}${credit_delta})`);
      }

      if (hasMult) {
        const oldDelta = profile.multiplier_override || 0;
        profile.multiplier_override = oldDelta + multDelta;
        await profile.save();
        changes.push(`multiplier_delta: ${oldDelta} → ${profile.multiplier_override} (${multDelta >= 0 ? '+' : ''}${multDelta})`);
      }
    }

    // Immediately rebuild ranking so the change is visible without waiting
    // for the next sync cycle.
    try {
      await rebuildRankingSnapshot();
    } catch (rebuildErr) {
      console.error('Root adjust-credit: ranking rebuild failed:', rebuildErr);
    }

    safeJson(res, 200, {
      ok: true,
      address: addr,
      changes: changes.join('; '),
      profile: {
        credit_override: profile.credit_override,
        multiplier_override: profile.multiplier_override,
      },
    });
  } catch (err) {
    console.error('Root adjust-credit error:', err);
    safeJson(res, 500, { detail: 'Adjustment failed' });
  }
});

// ─── POST /api/root/delete-user ─────────────────────────────────
// Delete a user and ALL their records from the database. Requires root JWT.
// This is irreversible — use with caution.
// Body: { address }
router.post('/delete-user', async (req: Request, res: Response) => {
  if (!requireRoot(req, res)) return;

  const { address } = req.body || {};
  if (!address || typeof address !== 'string') {
    safeJson(res, 400, { detail: 'address is required' });
    return;
  }

  const addr = address.toLowerCase();

  try {
    const results: string[] = [];

    // Delete from all collections
    const profileDel = await Profile.deleteOne({ address: addr });
    if (profileDel.deletedCount > 0) results.push(`Profile: ${profileDel.deletedCount}`);

    const stakesDel = await Stake.deleteMany({ address: addr });
    if (stakesDel.deletedCount > 0) results.push(`Stakes: ${stakesDel.deletedCount}`);

    const summaryDel = await StakeSummary.deleteOne({ address: addr });
    if (summaryDel.deletedCount > 0) results.push(`StakeSummary: ${summaryDel.deletedCount}`);

    const rankingDel = await RankingSnapshot.deleteOne({ address: addr });
    if (rankingDel.deletedCount > 0) results.push(`RankingSnapshot: ${rankingDel.deletedCount}`);

    const nonceDel = await Nonce.deleteMany({ address: addr });
    if (nonceDel.deletedCount > 0) results.push(`Nonces: ${nonceDel.deletedCount}`);

    const totalDeleted = profileDel.deletedCount + stakesDel.deletedCount +
      summaryDel.deletedCount + rankingDel.deletedCount + nonceDel.deletedCount;

    console.log(`[root] Deleted user ${addr}: ${results.join(', ') || 'nothing to delete'}`);

    safeJson(res, 200, {
      ok: true,
      address: addr,
      deleted: results,
      total: totalDeleted,
    });
  } catch (err) {
    console.error('Root delete-user error:', err);
    safeJson(res, 500, { detail: 'Delete failed' });
  }
});

export default router;

// Startup diagnostic — logs only the configured clearance-code LENGTH (never
// the value), so operators can confirm FILE Z is enabled without leaking it.
if (config.rootTerminalPassword) {
  console.log(`[root] CLASSIFIED terminal enabled (clearance code length ${config.rootTerminalPassword.length})`);
} else {
  console.log('[root] CLASSIFIED terminal DISABLED — set ROOT_TERMINAL_PASSWORD to enable FILE Z');
}
