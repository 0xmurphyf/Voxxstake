import { IStake } from '../models/Stake';
import { StakingPosition, POINTS_PER_NFT_PER_HOUR, HOLDING_MULTIPLIER_INCREMENT } from '../types';

/**
 * Calculate holding multiplier based on number of NFTs held.
 * Base: 1.0x
 * +0.001x per NFT held, no upper limit.
 * Examples: 1 NFT → 1.0x, 2 NFTs → 1.001x, 20 → 1.019x, 100 → 1.099x
 */
export function getHoldingMultiplier(nftCount: number): number {
  if (nftCount <= 1) return 1.0;
  return 1.0 + (nftCount - 1) * HOLDING_MULTIPLIER_INCREMENT;
}

/**
 * Compute total active seconds including current session.
 */
export function computeTotalActiveSeconds(stake: IStake, now: Date): number {
  let total = stake.total_staked_seconds || 0.0;
  if (stake.status === 'active' && stake.current_session_start) {
    const sessionStart = new Date(stake.current_session_start);
    total += Math.max(0.0, (now.getTime() - sessionStart.getTime()) / 1000);
  }
  return total;
}

/**
 * Compute lore points for a single NFT.
 *
 * Points = locked_points + current_session_points
 * Current session: totalHours × POINTS_PER_NFT_PER_HOUR × holdingMultiplier
 *
 * locked_points are permanently locked and never decrease.
 * When an NFT is paused, the current session's points are locked in.
 */
export function computePoints(
  stake: IStake,
  holdingMultiplier: number,
  now: Date
): { points: number; durationDays: number } {
  const totalActiveSeconds = computeTotalActiveSeconds(stake, now);
  const durationDays = totalActiveSeconds / 86400;

  // Points from previously completed (paused) sessions — locked forever
  const locked = stake.locked_points || 0;

  // Points from the current active session (if any)
  let currentSessionPoints = 0;
  if (stake.status === 'active' && stake.current_session_start) {
    const sessionStart = new Date(stake.current_session_start);
    const sessionSeconds = Math.max(0, (now.getTime() - sessionStart.getTime()) / 1000);
    const sessionHours = sessionSeconds / 3600;
    currentSessionPoints = Math.round(sessionHours * POINTS_PER_NFT_PER_HOUR * holdingMultiplier);
  }

  const points = locked + currentSessionPoints;
  return { points, durationDays };
}

/**
 * Build a StakingPosition from a stake document.
 */
export function buildPositionFromStake(
  stake: IStake,
  holdingMultiplier: number,
  ownedSet: Set<string> | null
): StakingPosition {
  const now = new Date();
  const totalActiveSeconds = computeTotalActiveSeconds(stake, now);
  const { points, durationDays } = computePoints(stake, holdingMultiplier, now);

  return {
    object_id: stake.object_id,
    name: stake.name,
    image_url: stake.image_url,
    created_at: stake.created_at,
    total_staked_seconds: totalActiveSeconds,
    current_session_start: stake.current_session_start,
    status: stake.status,
    lore_points: points,
    duration_days: durationDays,
    holding_multiplier: holdingMultiplier,
    is_owned: ownedSet !== null
      ? ownedSet.has(stake.object_id)
      : stake.status === 'active',
  };
}

/**
 * Build StakingStats from an array of positions.
 * Sort: active first, then paused; within each group, descending lore_points.
 */
export function buildStatsFromPositions(
  positions: StakingPosition[],
  sellAlerts: string[],
  nftCount: number,
  holdingMultiplier: number
) {
  const sorted = [...positions].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'active' ? -1 : 1;
    }
    return b.lore_points - a.lore_points;
  });

  return {
    total_active: sorted.filter((p) => p.status === 'active').length,
    total_paused: sorted.filter((p) => p.status === 'paused').length,
    total_lore_points: sorted.reduce((sum, p) => sum + p.lore_points, 0),
    nft_count: nftCount,
    holding_multiplier: holdingMultiplier,
    positions: sorted,
    sell_alerts: sellAlerts,
  };
}
