import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Try to load .env file (silently skip if not found, e.g. Railway injects env vars directly)
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

// ─── JWT secret (security-critical) ───────────────────────────
// Must be provided via JWT_SECRET env var in production. We NEVER fall back to
// a hardcoded default — this repo is public, so any committed default is
// publicly known and trivially forgeable. In production, a missing secret
// aborts startup; in dev we generate an ephemeral random secret instead.
let jwtSecret: string;
const rawJwtSecret = process.env.JWT_SECRET;
if (rawJwtSecret) {
  jwtSecret = rawJwtSecret;
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production. Refusing to start with an insecure default.');
} else {
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  JWT_SECRET not set — using an ephemeral dev-only secret. Set JWT_SECRET for production deployments.');
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
  jwtSecret,
  // Admin addresses: comma-separated list of Sui addresses that can access /api/admin
  adminAddresses: (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map(s => s.toLowerCase().trim())
    .filter(Boolean),
  // Rate limiting: minimum seconds between sync calls per address
  syncRateLimitSeconds: parseInt(process.env.SYNC_RATE_LIMIT_SEC || '60', 10),
};
