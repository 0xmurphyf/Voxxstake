# Voxxstake

Voxxstake is the **Neoterra Citizenship Registry** for VOXX Genesis NFT holders on Sui. It is a non-custodial soft-staking application: eligible NFTs remain in the holder's wallet while the service verifies ownership, records active holding time, and awards citizenship credits.

## How it works

1. Connect a supported Sui wallet.
2. Sign a one-time message to prove wallet ownership.
3. The backend scans both directly owned objects and NFTs held in Sui Kiosks.
4. Eligible VOXX NFTs are registered automatically and begin earning credits.
5. When an NFT leaves the wallet, its active session is paused and the credits already earned are preserved.
6. If the NFT returns, registration resumes in a new session.

No NFT transfer, lock transaction, or gas payment is required.

### Credits and multiplier

Each active NFT earns **1 credit per hour**. The holding multiplier is based on the number of eligible NFTs currently held:

```text
multiplier = 1.0 + max(0, NFT count - 1) × 0.001
```

Examples:

| Eligible NFTs | Multiplier |
| ---: | ---: |
| 1 | 1.000× |
| 2 | 1.001× |
| 20 | 1.019× |
| 100 | 1.099× |

The multiplier is frozen for each active session so previously accrued credits do not decrease if the holder later owns fewer NFTs. Completed-session credits are stored as locked points.

## Features

- Non-custodial VOXX NFT soft staking
- Direct-wallet and Sui Kiosk ownership discovery
- Wallet-signature authentication with single-use nonces and JWT sessions
- Cached dashboard reads and user-triggered on-chain synchronization
- Automatic background ownership synchronization
- Active and revoked registration history
- Public, precomputed citizenship ranking
- User aliases and NFT profile pictures
- NFT metadata details and a cached raster image proxy
- SUI balance display
- Admin statistics restricted by configured Sui addresses
- Password-protected File Z operations for support and data administration
- Partial-scan protection that preserves the last complete ownership count when a Kiosk scan fails

## Supported wallets

- Slush
- Phantom
- OKX Wallet
- Binance Web3 Wallet

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | React 19, CRACO, Tailwind CSS, Suiet Wallet Kit, Mysten Slush Wallet |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB with Mongoose |
| Sui access | Mysten Sui SDK, gRPC primary, GraphQL fallback |
| Authentication | Sui personal-message signatures and HS256 JWTs |
| Deployment | Single service or Docker image serving the built React SPA and API |

```text
Voxxstake/
├── backend/
│   └── src/
│       ├── middleware/    # JWT authentication
│       ├── models/        # MongoDB models
│       ├── routes/        # API routes
│       ├── services/      # Sui access, staking, sync and security helpers
│       ├── config.ts      # Runtime configuration
│       └── index.ts       # Express server
├── frontend/
│   ├── public/            # SPA metadata and static assets
│   └── src/
│       ├── components/    # Registry UI
│       └── hooks/         # Wallet, auth, staking and NFT data hooks
├── Dockerfile
├── build.sh
├── start.sh
└── site.webmanifest
```

## Requirements

- Node.js 22 or newer
- npm
- MongoDB
- A Sui-compatible wallet for browser authentication

## Local development

### 1. Configure and start the backend

Create `backend/.env`:

```dotenv
NODE_ENV=development
PORT=8001
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=voxxstake
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGINS=http://localhost:3000
SUI_NETWORK=mainnet
```

Then start the API:

```bash
cd backend
npm install
npm run dev
```

### 2. Configure and start the frontend

Create `frontend/.env`:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
```

Then start the frontend:

```bash
cd frontend
npm install
npm start
```

The frontend runs at `http://localhost:3000` by default and calls the backend at the URL supplied through `REACT_APP_BACKEND_URL`.

## Production build

The root scripts build the frontend and run the backend as one service:

```bash
npm install
npm start
```

The root `postinstall` script installs backend and frontend dependencies and creates `frontend/build`. Express then serves that build alongside the API.

To build and run the Docker image instead:

```bash
docker build -t voxxstake .
docker run --rm -p 8001:8001 --env-file backend/.env voxxstake
```

The Docker build also copies the root application icons and web manifest into the final frontend build.

## Environment variables

### Backend

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | unset | Must be `production` in production; enables strict CORS, JWT, and debug behavior. |
| `PORT` | `8001` | HTTP server port. |
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection string. |
| `DB_NAME` | `voxxstake` | MongoDB database name. |
| `JWT_SECRET` | random in development | JWT signing secret. Required in production. |
| `CORS_ORIGINS` | `*` in development; none in production | Comma-separated allowed origins. Set explicitly in production. |
| `SUI_NETWORK` | `mainnet` | `mainnet`, `testnet`, `devnet`, or `localnet`. |
| `SUI_GRPC_URL` | network-dependent | Primary Sui gRPC endpoint. |
| `SUI_GRPC_FAILOVER` | Foundation mainnet endpoint on mainnet | Comma-separated gRPC failover endpoints. |
| `SUI_GRPC_TIMEOUT_MS` | `15000` | Timeout per gRPC endpoint attempt. |
| `SUI_GRPC_MAX_ATTEMPTS` | `3` | Attempts per endpoint, clamped to 1–5. |
| `SUI_KIOSK_CONCURRENCY` | `6` | Concurrent Kiosk scans, clamped to 1–16. |
| `SUI_GRAPHQL_URL` | network-dependent | Final read fallback and zkLogin verification endpoint. |
| `SYNC_RATE_LIMIT_SEC` | `60` | Minimum interval between user syncs, clamped to 10–300 seconds. |
| `SYNC_INTERVAL_MINUTES` | `30` | Background ownership-sync interval. |
| `ADMIN_ADDRESSES` | empty | Comma-separated Sui addresses allowed to access admin statistics. |
| `ROOT_TERMINAL_PASSWORD` | empty | Enables File Z root authentication when set; the feature fails closed otherwise. |

`sui-grpc.publicnode.com` is intentionally ignored because its grpc-web-text response is incompatible with the native Node gRPC transport used by the application. Use a production-grade native gRPC provider for deployed environments.

### Frontend

| Variable | Default | Purpose |
| --- | --- | --- |
| `REACT_APP_BACKEND_URL` | same origin | API origin used by the React application. Leave empty when the frontend and backend share an origin. |

Never expose backend provider credentials, `JWT_SECRET`, or `ROOT_TERMINAL_PASSWORD` through a `REACT_APP_*` variable; React embeds those values in the public browser bundle.

## API overview

All authenticated user routes expect `Authorization: Bearer <token>`.

### Public and authentication

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check. |
| `POST` | `/api/auth/nonce` | Create a single-use wallet-signing message. |
| `POST` | `/api/auth/verify` | Verify the Sui signature and issue a JWT. |
| `GET` | `/api/ranking` | Return the paginated public ranking snapshot. |
| `GET` | `/api/visitor/count` | Record and return visitor totals. |
| `GET` | `/api/image/:objectId` | Fetch and cache a validated raster NFT image. |

`GET /api/debug/config` is available only outside production.

### Authenticated user routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/staking/cached` | Read the latest database-backed staking state without a chain call. |
| `POST` | `/api/staking/sync` | Run a full ownership sync. |
| `GET` | `/api/staking/positions` | Backward-compatible positions endpoint that syncs when allowed. |
| `GET` | `/api/staking/nft/:objectId` | Return NFT metadata and its staking position. |
| `GET` | `/api/staking/debug/nfts` | Return ownership-scan diagnostics for the authenticated address. |
| `GET` | `/api/profile` | Read the current user's profile. |
| `PUT` | `/api/profile` | Update alias or NFT profile-picture fields. |
| `GET` | `/api/balance/:address` | Read a SUI balance through the backend gRPC client. |
| `GET` | `/api/admin/stats` | Return platform statistics for configured admin addresses. |

File Z routes are under `/api/root`. They use a separate 15-minute root token issued by `/api/root/auth` and include whitelisted data queries, targeted/full synchronization, credit adjustments, and user deletion operations.

## Data synchronization

- A user can request a full scan through the dashboard, subject to a per-address rate limit.
- The service performs a background sync 30 seconds after startup and then at `SYNC_INTERVAL_MINUTES` intervals.
- Directly owned NFTs and Kiosk-held NFTs are reconciled together.
- A failed or incomplete Kiosk scan is treated as partial data and cannot overwrite the last known complete ownership count.
- Ranking responses are served from precomputed snapshots instead of recalculating every user on each request.

## Security behavior

- Production startup requires `JWT_SECRET`.
- Production CORS is disabled until `CORS_ORIGINS` is configured.
- Authentication nonces expire after five minutes and are deleted after successful verification.
- User JWTs expire after four hours.
- Authentication, ranking, image, and sync endpoints have in-memory throttling.
- NFT image downloads reject private and local destinations, refuse redirects, permit raster formats only, and cap response size.
- Root terminal access uses a server-only password, short-lived tokens, constant-time password comparison, and a global failed-attempt lockout.

The in-memory throttles and root lockout state are process-local and are designed for a single application replica.

## Tests

Backend tests cover Sui data access and ownership reconciliation:

```bash
cd backend
npm test
```

Build checks:

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

## License

No license file is currently included in this repository.
