# Voxxstake — VOXX NFT Soft Staking Platform

> Last deploy: 2025-01-20 | Debug: `/api/debug/config`, `/api/staking/debug/nfts?address=0x...`

A decentralized NFT soft-staking platform built on the **Sui blockchain**. Hold VOXX NFTs in your wallet to automatically accumulate Lore Points — no transactions, no gas fees, no locking. Your NFTs stay in your wallet at all times.

## How It Works

- **Auto-Stake**: Just hold VOXX NFTs in your wallet — staking begins automatically
- **Tiered Rewards**: Longer holds unlock higher multipliers
  - Bronze (1×): 0+ days
  - Silver (1.5×): 7+ days
  - Gold (2×): 30+ days
  - Platinum (3×): 90+ days
- **Sell Detection**: If an NFT leaves your wallet, staking pauses but your points are preserved
- **Points Formula**: `days × 10 × tier_multiplier`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Tailwind CSS, @suiet/wallet-kit, shadcn/ui |
| Backend | Node.js, Express, TypeScript, Mongoose |
| Database | MongoDB |
| Blockchain | Sui Network (Devnet/Testnet/Mainnet) |

## Project Structure

```
voxxstake/
├── backend/               # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── index.ts       # Entry point
│   │   ├── config.ts      # Environment config
│   │   ├── db.ts          # MongoDB connection
│   │   ├── models/        # Mongoose schemas (Nonce, Stake, Tier)
│   │   ├── routes/        # Express routers (auth, staking, admin)
│   │   ├── services/      # Business logic (sui, staking)
│   │   ├── middleware/    # JWT auth middleware
│   │   └── types/         # TypeScript type definitions
│   ├── package.json
│   └── tsconfig.json
├── frontend/              # React 19 SPA
│   └── src/
│       ├── components/    # UI components
│       └── hooks/         # Custom React hooks
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 7+
- A Sui-compatible wallet (Slush, Phantom, OKX, Binance Web3)

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URL and JWT secret

npm install
npm run dev        # Development with hot reload
# or
npm run build && npm start   # Production
```

### Frontend Setup

```bash
cd frontend
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn install
yarn start
```

### Environment Variables

**Backend** (`backend/.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | API server port |
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | `voxxstake` | Database name |
| `CORS_ORIGINS` | (none → dev `*`, prod `[]`) | Allowed CORS origins (comma-separated). **Production: if unset, CORS is fully disabled (`origin:false`), not `*`.** Set explicitly in prod. |
| `SUI_NETWORK` | `mainnet` | Sui network (`mainnet`, `testnet`, `devnet`, or `localnet`) |
| `SUI_GRPC_URL` | `https://fullnode.mainnet.sui.io:443` | Primary Sui gRPC endpoint. Use a managed provider in production. |
| `SUI_GRPC_FAILOVER` | (none) | Optional comma-separated gRPC failover endpoints |
| `SUI_GRPC_TIMEOUT_MS` | `15000` | Per-endpoint gRPC request timeout |
| `SUI_GRPC_MAX_ATTEMPTS` | `3` | Attempts per endpoint for transient gRPC failures |
| `SUI_KIOSK_CONCURRENCY` | `6` | Maximum number of Kiosks scanned concurrently |
| `SUI_GRAPHQL_URL` | `https://graphql.mainnet.sui.io/graphql` | Final read fallback and zkLogin verification endpoint |
| `JWT_SECRET` | (required) | Secret for JWT signing |

For Railway production deployments, remove the retired `SUI_RPC_URL`,
`SUI_RPC_FAILOVER`, and `SUI_RPC_TIMEOUT_MS` variables. Set `SUI_GRPC_URL` to
a managed provider's **gRPC** endpoint (plus `SUI_GRPC_FAILOVER` when available)
and keep all provider credentials on the backend. Do not add these URLs or keys
to `REACT_APP_*` variables. The Foundation defaults are suitable for local
development but are rate-limited.

**Frontend** (`frontend/.env`):

| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Backend API base URL |

## API Endpoints

### Auth
- `POST /api/auth/nonce` — Get a nonce for wallet signing
- `POST /api/auth/verify` — Verify signature and get JWT

### Staking
- `GET /api/staking/cached` — Fast DB-only read (no chain request)
- `POST /api/staking/sync` — Full on-chain sync
- `GET /api/staking/positions` — Alias for sync
- `GET /api/staking/nft/:objectId` — NFT detail with metadata

### Admin (requires `ADMIN_ADDRESSES` — address must be in that list, not just any logged-in user)
- `GET /api/admin/stats` — Platform statistics (total users / stakes / points)

> Note: reward-tier multipliers are computed in code (`getHoldingMultiplier`), not via a mutable `/api/admin/tiers` endpoint. There is **no** public tier-modification route. The `Tier` model exists but is currently unused.

## Supported Wallets

- Slush — A Sui wallet (zkLogin enabled)
- Phantom
- OKX Wallet
- Binance Web3 Wallet

## License

MIT
