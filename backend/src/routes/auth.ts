import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Nonce } from '../models/Nonce';
import { verifySignature } from '../services/sui';
import { config } from '../config';
import { NONCE_EXPIRY_SECONDS, JWT_EXPIRY_HOURS, JWT_ALGORITHM } from '../types';

const router = Router();

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
 */
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address) {
      res.status(400).json({ detail: 'Address is required' });
      return;
    }

    const normalized = normalizeAddress(address);
    const nonce = crypto.randomBytes(16).toString('hex');

    await Nonce.create({
      address: normalized,
      nonce,
      created_at: new Date(),
      used: false,
    });

    res.json({ nonce });
  } catch (err) {
    console.error('Nonce creation error:', err);
    res.status(500).json({ detail: 'Failed to create nonce' });
  }
});

/**
 * POST /api/auth/verify
 * Verify a Sui wallet signature and issue a JWT.
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { address, nonce, signature, bytes } = req.body;
    if (!address || !nonce || !signature || !bytes) {
      res.status(400).json({ detail: 'Missing required fields' });
      return;
    }

    const normalized = normalizeAddress(address);

    // Look up nonce
    const doc = await Nonce.findOne({ address: normalized, nonce });
    if (!doc) {
      res.status(400).json({ detail: 'Invalid nonce' });
      return;
    }
    if (doc.used) {
      res.status(400).json({ detail: 'Nonce already used' });
      return;
    }

    // Check expiry
    const age = (Date.now() - doc.created_at.getTime()) / 1000;
    if (age > NONCE_EXPIRY_SECONDS) {
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

    // Mark nonce as used
    doc.used = true;
    await doc.save();

    // Issue JWT
    const payload = {
      sub: normalized,
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_HOURS * 3600,
      iat: Math.floor(Date.now() / 1000),
    };
    const token = jwt.sign(payload, config.jwtSecret, { algorithm: JWT_ALGORITHM as jwt.Algorithm });

    res.json({ token, address: normalized });
  } catch (err) {
    console.error('Signature verification error:', err);
    res.status(500).json({ detail: 'Verification failed' });
  }
});

export default router;
