# VOXX NFT Staking Platform

A decentralized NFT staking platform built on the Sui blockchain, allowing VOXX NFT holders to stake their assets and earn points through a tiered rewards system.

## Features

### Core Functionality
- **Multi-Wallet Support**: Connect using Sui Wallet, Suiet Wallet, or Slush Wallet
- **NFT Staking**: Stake VOXX NFTs to earn points
- **Tiered Rewards**: Multiple reward tiers based on staking duration
  - Bronze (1x): 0+ days
  - Silver (1.5x): 7+ days
  - Gold (2x): 30+ days
  - Platinum (3x): 90+ days
- **Points System**: Base rate of 10 points per day with tier multipliers
- **Real-time Tracking**: Dashboard showing staked NFTs and earned points
- **Admin Panel**: Manage reward tiers and view platform statistics

### Technical Features
- Wallet-only authentication (signature-based login)
- On-chain NFT ownership verification
- Off-chain staking records with MongoDB
- RESTful API with FastAPI
- Modern React UI with Suiet Wallet Kit

## Architecture

### Backend (FastAPI + MongoDB)
- `/api/auth/*` - Wallet authentication (nonce generation, signature verification)
- `/api/staking/*` - Staking operations (stake, unstake, positions, NFT listing)
- `/api/admin/*` - Admin operations (tier management, statistics)

### Frontend (React + Suiet Wallet Kit)
- Wallet integration with Sui, Suiet, and Slush wallets
- NFT listing and staking interface
- Dashboard with stats and active positions
- Admin panel for tier management

### Blockchain Integration
- **Network**: Sui (Devnet/Testnet/Mainnet configurable)
- **NFT Collection**: `0xdca282f30ff2acc0083c5c90969ae97c59a638a6a50ab9112f7ea17507cdd2b7::voxx__inc_::Nft`
- **RPC**: Sui full node JSON-RPC API

## Design System

### Color Palette
- Background: `#05050A` (Deep black)
- Surface: `#0D111A` (Dark blue-gray)
- Primary: `#3898FF` (Sui blue)
- Accent: `#00F0FF` (Cyan glow)
- Success: `#00FF9D` (Green)
- Warning: `#FFB800` (Amber)
- Danger: `#FF3B30` (Red)

### Typography
- **Headings**: Unbounded (Black, 900 weight)
- **Body**: IBM Plex Sans

### UI Style
- Glassmorphism effects with backdrop blur
- Sharp corners (rounded-sm)
- Neon glow borders on hover
- High contrast text on dark backgrounds

## Getting Started

### Prerequisites
- Node.js 20+
- Python 3.11+
- MongoDB
- Sui Wallet browser extension (for testing)

### Environment Variables

**Backend** (`/app/backend/.env`):
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
CORS_ORIGINS=*
SUI_RPC_URL=https://fullnode.devnet.sui.io:443
JWT_SECRET=your-secret-key
```

**Frontend** (`/app/frontend/.env`):
```
REACT_APP_BACKEND_URL=https://your-backend-url.com
```

### Running the Application

**Backend**:
```bash
cd /app/backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```

**Frontend**:
```bash
cd /app/frontend
yarn install
yarn start
```

## Testing

### Manual Testing Flow
1. Install Sui Wallet browser extension
2. Switch wallet to Devnet
3. Get test SUI from faucet: https://faucet.devnet.sui.io/
4. Connect wallet on the platform
5. Sign authentication message
6. View your VOXX NFTs (if you own any on Devnet)
7. Stake/unstake NFTs
8. View dashboard and statistics
9. Access admin panel to manage tiers

### API Testing
```bash
# Health check
curl https://your-backend-url.com/api/health

# Get nonce
curl -X POST https://your-backend-url.com/api/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"0x..."}'

# Get default tiers
curl https://your-backend-url.com/api/admin/tiers
```

## Key Dependencies

### Backend
- `fastapi` - Web framework
- `motor` - Async MongoDB driver
- `pynacl` - Signature verification
- `httpx` - HTTP client for Sui RPC
- `pyjwt` - JWT token generation

### Frontend
- `@suiet/wallet-kit` - Sui wallet integration
- `@mysten/sui` - Sui TypeScript SDK
- `@phosphor-icons/react` - Icon library
- `react-router-dom` - Routing
- `axios` - HTTP client

## Security Considerations

- Wallet-only authentication (no passwords)
- JWT tokens for session management
- Nonce-based replay attack prevention
- On-chain ownership verification before staking
- CORS configuration for production
- Environment-based secret management

## Deployment Notes

- Backend runs on port 8001 with `/api` prefix
- Frontend uses `REACT_APP_BACKEND_URL` for API calls
- MongoDB connection via `MONGO_URL`
- Configure `SUI_RPC_URL` for target network (Devnet/Testnet/Mainnet)
- Set strong `JWT_SECRET` in production

## Future Enhancements

Potential improvements for the platform:
- On-chain staking contracts for trustless locking
- NFT metadata display with images
- Leaderboard showing top stakers
- Reward token distribution integration
- Multiple NFT collection support
- Email notifications for milestone achievements
- Mobile app with wallet integration
- Analytics dashboard for admins

## License

Built with Emergent.sh
