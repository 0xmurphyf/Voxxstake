# Voxxstake — VOXX NFT Soft Staking Platform

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
| `CORS_ORIGINS` | `*` | Allowed CORS origins (comma-separated) |
| `SUI_RPC_URL` | `https://fullnode.devnet.sui.io:443` | Sui RPC endpoint |
| `JWT_SECRET` | (required) | Secret for JWT signing |

**Frontend** (`frontend/.env`):

| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL` | Backend API base URL |

## API Endpoints

### Auth
- `POST /api/auth/nonce` — Get a nonce for wallet signing
- `POST /api/auth/verify` — Verify signature and get JWT

### Staking
- `GET /api/staking/cached` — Fast DB-only read (no RPC)
- `POST /api/staking/sync` — Full on-chain sync
- `GET /api/staking/positions` — Alias for sync
- `GET /api/staking/nft/:objectId` — NFT detail with metadata

### Admin
- `GET /api/admin/tiers` — List reward tiers
- `POST /api/admin/tiers` — Update reward tiers
- `GET /api/admin/stats` — Platform statistics

## Supported Wallets

- Slush — A Sui wallet (zkLogin enabled)
- Phantom
- OKX Wallet
- Binance Web3 Wallet

## License

MIT
