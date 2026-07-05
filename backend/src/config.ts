import dotenv from 'dotenv';
import path from 'path';

// Try to load .env file (silently skip if not found, e.g. Railway injects env vars directly)
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

// ─── Security checks ──────────────────────────────────────────
// In production (NODE_ENV=production), JWT_SECRET MUST be set via env var.
// Fallback to a default is ONLY allowed in development.
const DEFAULT_JWT_SECRET = 'dev-secret-key-do-not-use-in-production';
const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production');
  }
  console.warn('WARNING: Using default JWT_SECRET — DO NOT use in production!');
}

export const config = {
  port: parseInt(process.env.PORT || '8001', 10),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
  dbName: process.env.DB_NAME || 'voxxstake',
  // CORS: in production set CORS_ORIGINS to a comma-separated list of allowed origins.
  // Falls back to '*' only when CORS_ORIGINS is unset AND NODE_ENV is not production.
  corsOrigins: (() => {
    const raw = process.env.CORS_ORIGINS;
    if (raw) return raw.split(',').map(s => s.trim());
    if (process.env.NODE_ENV === 'production') return []; // production: must be explicit
    return ['*'];
  })(),
  // Sui RPC endpoints: primary + failover(s)
  suiRpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.mainnet.sui.io:443',
  suiRpcFailoverUrls: (process.env.SUI_RPC_FAILOVER || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  suiRpcTimeoutMs: parseInt(process.env.SUI_RPC_TIMEOUT_MS || '15000', 10),
  jwtSecret: rawJwtSecret || DEFAULT_JWT_SECRET,
  // Admin addresses: comma-separated list of Sui addresses that can access /api/admin
  adminAddresses: (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map(s => s.toLowerCase().trim())
    .filter(Boolean),
  // Rate limiting: minimum seconds between sync calls per address
  syncRateLimitSeconds: parseInt(process.env.SYNC_RATE_LIMIT_SEC || '60', 10),
};
