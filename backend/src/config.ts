import dotenv from 'dotenv';
import path from 'path';

// Try to load .env file (silently skip if not found, e.g. Railway injects env vars directly)
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

export const config = {
  port: parseInt(process.env.PORT || '8001', 10),
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017',
  dbName: process.env.DB_NAME || 'voxxstake',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim()),
  suiRpcUrl: process.env.SUI_RPC_URL || 'https://fullnode.devnet.sui.io:443',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production',
};
