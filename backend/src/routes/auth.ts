import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Nonce } from '../models/Nonce';
import { Profile } from '../models/Profile';
import { verifySignature } from '../services/sui';
import { config } from '../config';
import { createThrottle } from '../services/throttle';
import { NONCE_EXPIRY_SECONDS, JWT_EXPIRY_HOURS, JWT_ALGORITHM } from '../types';

const router = Router();

// ─── Per-IP throttle for auth endpoints (nonce/verify) ──────────
// Prevents unauthenticated DB-write amplification via /nonce spam and
// brute-force-ish /verify hammering. Single-instance in-memory (sufficient
// for Railway single-replica).
const AUTH_MIN_INTERVAL_MS = 3000;
const authThrottleGuard = createThrottle({ minIntervalMs: AUTH_MIN_INTERVAL_MS });

// Use Express's req.ip, which is correctly derived from the trusted proxy
// (app.set('trust proxy', 1) in index.ts). Reading x-forwarded-for directly
// would let any client forge its IP via a header and bypass every per-IP
// throttle / rate limit in this file. req.ip is the only trustworthy source.
function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function authThrottle(req: Request, res: Response): boolean {
  const ip = clientIp(req);
  if (!authThrottleGuard.allow(ip)) {
    res
      .status(429)
      .json({ detail: 'Too many auth requests, slow down.', retry_after_seconds: Math.ceil(AUTH_MIN_INTERVAL_MS / 1000) });
    return false;
  }
  return true;
}

/**
 * Normalize Sui address to lowercase 0x-prefixed.
 */
function normalizeAddress(addr: string): string {
  let a = addr.toLowerCase().trim();
  if (!a.startsWith('0x')) {
    a = '0x' + a;
  }
  return a;
}

/**
 * POST /api/auth/nonce
 * Generate a nonce for wallet authentication.
 * Uses findOneAndUpdate with upsert to atomically replace any existing unused
 * nonce — the unique partial index on { address, used: false } guarantees at
 * most one unused nonce per address at the database level, closing the race
 * window that existed with the old deleteMany-then-create pattern.
 */
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    if (!authThrottle(req, res)) return;

    const { address, purpose } = req.body;
    if (!address) {
      res.status(400).json({ detail: 'Address is required' });
      return;
    }

    const normalized = normalizeAddress(address);

    const randomPart = crypto.randomBytes(16).toString('hex');
    const requestTitle = purpose === 'voss-executive-selection'
      ? 'ENTERING EXECUTIVE SELECTION SYSTEM'
      : 'Apply for Neoterra Citizenship';
    // Human-readable message so the user's wallet shows what they're signing
    const nonce = `${requestTitle}\n\nWallet: ${normalized}\nNonce: ${randomPart}`;

    // Race-safe nonce creation: INSERT only (never UPDATE).
    //
    //   The unique partial index on { address, used: false } (see models/Nonce.ts)
    //   guarantees at most one unused nonce per address. When two concurrent
    //   requests both try to insert, one hits E11000. The loser reads back the
    //   winner's nonce and returns THAT to the client — both clients receive
    //   the same nonce and /verify works for both.
    //
    //   Old unused nonces are cleaned up by the TTL index on created_at
    //   (NONCE_EXPIRY_SECONDS + 60s), so we never need to delete them explicitly.
    try {
      await Nonce.create({ address: normalized, nonce, created_at: new Date() });
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        (err as Record<string, unknown>).code === 11000
      ) {
        // Race lost — read the winner's nonce and check freshness.
        const existing = await Nonce.findOne({ address: normalized, used: false }).lean();
        if (existing) {
          const age = (Date.now() - existing.created_at.getTime()) / 1000;
          if (age <= NONCE_EXPIRY_SECONDS) {
            // Winner's nonce is fresh — return it to the client.
            res.json({ nonce: existing.nonce, address: normalized });
            return;
          }
          // Winner's nonce is stale — delete it so we can create a fresh one.
          await Nonce.deleteOne({ _id: existing._id });
        }
        // Retry insert (existing was stale or TTL-deleted between E11000 and read).
        // Wrapped in try/catch in case a 3rd concurrent request inserts between
        // our delete and create — rare but possible under concurrent load.
        try {
          await Nonce.create({ address: normalized, nonce, created_at: new Date() });
        } catch (e2: unknown) {
          if (
            e2 &&
            typeof e2 === 'object' &&
            (e2 as Record<string, unknown>).code === 11000
          ) {
            const again = await Nonce.findOne({ address: normalized, used: false }).lean();
            if (again) {
              res.json({ nonce: again.nonce, address: normalized });
              return;
            }
          } else {
            throw e2;
          }
        }
      } else {
        throw err;
      }
    }

    res.json({ nonce });
  } catch (err) {
    console.error('Nonce creation error:', err);
    res.status(500).json({ detail: 'Failed to create nonce' });
  }
});

/**
 * POST /api/auth/verify
 * Verify a Sui wallet signature and issue a JWT.
 * Nonce is DELETED after successful verification (one-time use, anti-replay).
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    if (!authThrottle(req, res)) return;

    const { address, nonce, signature, bytes } = req.body;
    if (!address || !nonce || !signature || !bytes) {
      res.status(400).json({ detail: 'Missing required fields' });
      return;
    }

    const normalized = normalizeAddress(address);

    // Look up nonce — must be unused and unexpired
    const doc = await Nonce.findOne({ address: normalized, nonce, used: false });
    if (!doc) {
      res.status(400).json({ detail: 'Invalid or already used nonce' });
      return;
    }

    // Check expiry
    const age = (Date.now() - doc.created_at.getTime()) / 1000;
    if (age > NONCE_EXPIRY_SECONDS) {
      // Delete expired nonce
      await Nonce.deleteOne({ _id: doc._id });
      res.status(400).json({ detail: 'Nonce expired' });
      return;
    }

    // Verify the signed message matches the nonce
    let signedMsg: string;
    try {
      signedMsg = Buffer.from(bytes, 'base64').toString('utf-8');
    } catch {
      res.status(400).json({ detail: 'Invalid message encoding' });
      return;
    }

    if (signedMsg !== nonce) {
      res.status(400).json({ detail: 'Signed message does not match nonce' });
      return;
    }

    // Verify the Sui signature
    const valid = await verifySignature(normalized, nonce, signature, bytes);
    if (!valid) {
      res.status(400).json({ detail: 'Invalid signature' });
      return;
    }

    // DELETE the nonce immediately — one-time use, anti-replay
    await Nonce.deleteOne({ _id: doc._id });

    // Ensure a Profile exists for every authenticated user (even without NFTs).
    // upsert: creates if not exists, no-op otherwise.
    // last_ip / last_seen_at are refreshed on every successful login ($set) so the
    // most-recent client IP is always recorded for anti-abuse / fraud review.
    const clientAddress = clientIp(req);
    await Profile.findOneAndUpdate(
      { address: normalized },
      {
        $setOnInsert: { address: normalized, name: '', updated_at: new Date().toISOString() },
        $set: { last_ip: clientAddress, last_seen_at: new Date().toISOString() },
      },
      { upsert: true }
    );

    // Issue JWT with exp claim
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: normalized,
      exp: now + JWT_EXPIRY_HOURS * 3600,
      iat: now,
    };
    const token = jwt.sign(payload, config.jwtSecret, { algorithm: JWT_ALGORITHM as jwt.Algorithm });

    res.json({ token, address: normalized });
  } catch (err) {
    console.error('Signature verification error:', err);
    res.status(500).json({ detail: 'Verification failed' });
  }
});

export default router;
