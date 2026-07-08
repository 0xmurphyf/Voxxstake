import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  address?: string;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ detail: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    // Pin the algorithm so a malicious/alg-confusion token (e.g. "none" or
    // "RS256") can never be accepted. jwt v9 already rejects "none", but this
    // is explicit defense-in-depth against algorithm downgrade attacks.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as { sub: string };
    req.address = payload.sub;
    next();
  } catch {
    res.status(401).json({ detail: 'Invalid or expired token' });
  }
}
