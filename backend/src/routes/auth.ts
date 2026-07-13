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

    const { address } = req.body;
    if (!address) {
      res.status(400).json({ detail: 'Address is required' });
      return;
    }

    const normalized = normalizeAddress(address);

    const randomPart = crypto.randomBytes(16).toString('hex');
    // Human-readable message so the user's wallet shows what they're signing
    const nonce = `Apply for Neoterra Citizenship\n\nWallet: ${normalized}\nNonce: ${randomPart}`;

    // Atomically upsert: if an unused nonce exists for this address, replace it;
    // otherwise insert a new one. The unique partial index on { address, used: false }
    // (see models/Nonce.ts) guarantees at most one unused nonce per address.
    //
    // In the rare case where two concurrent /nonce calls both attempt to insert
    // (because neither found an existing unused nonce), the second one hits a
    // duplicate-key error (E11000). We catch that and retry as a plain update.
    try {
      await Nonce.findOneAndUpdate(
        { address: normalized, used: false },
        { $set: { nonce, created_at: new Date() } },
        { upsert: true, new: true }
      );
    } catch (err: unknown) {
      // MongoDB duplicate key error — another request beat us to the insert.
      // Retry as a plain update (the document now exists).
      if (
        err &&
        typeof err === 'object' &&
        (err as Record<string, unknown>).code === 11000
      ) {
        await Nonce.updateOne(
          { address: normalized, used: false },
          { $set: { nonce, created_at: new Date() } }
        );
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
