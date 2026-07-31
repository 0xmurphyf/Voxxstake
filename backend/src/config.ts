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

const suiNetwork = (() => {
  const network = process.env.SUI_NETWORK || 'mainnet';
  if (!['mainnet', 'testnet', 'devnet', 'localnet'].includes(network)) {
    throw new Error(`Invalid SUI_NETWORK: ${network}`);
  }
  return network as 'mainnet' | 'testnet' | 'devnet' | 'localnet';
})();

const defaultSuiGrpcUrl =
  suiNetwork === 'localnet'
    ? 'http://127.0.0.1:9000'
    : `https://fullnode.${suiNetwork}.sui.io:443`;
const defaultSuiGraphqlUrl =
  suiNetwork === 'localnet'
    ? 'http://127.0.0.1:9125/graphql'
    : `https://graphql.${suiNetwork}.sui.io/graphql`;

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
  // Sui data access. gRPC is the primary transport; GraphQL is only used for
  // zkLogin signature verification, which needs the network's current JWKs.
  suiNetwork,
  suiGrpcUrl: process.env.SUI_GRPC_URL || defaultSuiGrpcUrl,
  suiGrpcFailoverUrls: (process.env.SUI_GRPC_FAILOVER || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  suiGrpcTimeoutMs: parseInt(process.env.SUI_GRPC_TIMEOUT_MS || '15000', 10),
  suiGraphqlUrl: process.env.SUI_GRAPHQL_URL || defaultSuiGraphqlUrl,
  jwtSecret,
  // Admin addresses: comma-separated list of Sui addresses that can access /api/admin
  adminAddresses: (process.env.ADMIN_ADDRESSES || '')
    .split(',')
    .map(s => s.toLowerCase().trim())
    .filter(Boolean),
  // Rate limiting: minimum seconds between sync calls per address.
  // Clamped to 10-300s so an operator can't accidentally set 0 (locking everyone
  // out) or an absurdly high value (effectively disabling the limit).
  syncRateLimitSeconds: Math.min(300, Math.max(10,
    parseInt(process.env.SYNC_RATE_LIMIT_SEC || '60', 10) || 60
  )),
  // Root terminal clearance password — gates the CLASSIFIED "FILE Z" data viewer.
  // MUST come from ROOT_TERMINAL_PASSWORD env var. Never hardcoded (the repo is
  // public). If null/empty, the root terminal endpoints fail closed (always denied).
  // Trimmed so a trailing newline/space from how the env var was set (e.g. Railway
  // paste) doesn't silently break the comparison.
  rootTerminalPassword: (process.env.ROOT_TERMINAL_PASSWORD || '').trim() || null,
};
