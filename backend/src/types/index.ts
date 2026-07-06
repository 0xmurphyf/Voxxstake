// ─── StakingPosition ───
export interface StakingPosition {
  object_id: string;
  name: string | null;
  image_url: string | null;
  created_at: string | null;
  total_staked_seconds: number;
  current_session_start: string | null;
  status: 'active' | 'paused';
  lore_points: number;
  duration_days: number;
  /** Holding multiplier (1.0 base, +0.001 per NFT, no upper limit) */
  holding_multiplier: number;
  is_owned: boolean;
}

// ─── StakingStats ───
export interface StakingStats {
  total_active: number;
  total_paused: number;
  total_lore_points: number;
  /** Number of NFTs currently held (owned) */
  nft_count: number;
  /** Current holding multiplier */
  holding_multiplier: number;
  positions: StakingPosition[];
  sell_alerts: string[];
}

// ─── AllStakesStats ───
export interface AllStakesStats {
  total_users: number;
  total_stakes: number;
  total_active_stakes: number;
  total_points_distributed: number;
}

// ─── Auth ───
export interface NonceRequest {
  address: string;
}

export interface NonceResponse {
  nonce: string;
}

export interface VerifyRequest {
  address: string;
  nonce: string;
  signature: string;
  bytes: string;
}

export interface VerifyResponse {
  token: string;
  address: string;
}

// ─── NFT Detail ───
export interface NFTDetailResponse {
  metadata: Record<string, unknown>;
  position: {
    status: string;
    lore_points: number;
    duration_days: number;
    holding_multiplier: number;
    created_at: string | null;
    current_session_start: string | null;
  } | null;
}

// ─── Constants ───
export const VOXX_TYPE =
  '0xdca282f30ff2acc0083c5c90969ae97c59a638a6a50ab9112f7ea17507cdd2b7::voxx__inc_::Nft';

/** Points per NFT per hour */
export const POINTS_PER_NFT_PER_HOUR = 1.0;

/** Points per NFT per day = 24 */
export const POINTS_PER_NFT_PER_DAY = POINTS_PER_NFT_PER_HOUR * 24;

/** Per-NFT multiplier increment (0.001x per NFT, no upper limit) */
export const HOLDING_MULTIPLIER_INCREMENT = 0.001;

export const NONCE_EXPIRY_SECONDS = 300;
export const JWT_EXPIRY_HOURS = 24;
export const JWT_ALGORITHM = 'HS256';
