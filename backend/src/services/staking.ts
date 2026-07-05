import { IStake } from '../models/Stake';
import { StakingPosition, POINTS_PER_NFT_PER_HOUR, HOLDING_MULTIPLIER_STEP, HOLDING_MULTIPLIER_BONUS } from '../types';

/**
 * Calculate holding multiplier based on number of NFTs held.
 * Base: 1.0x
 * +0.1x for every 10 NFTs (≥10 → 1.1x, ≥20 → 1.2x, etc.)
 */
export function getHoldingMultiplier(nftCount: number): number {
  if (nftCount < HOLDING_MULTIPLIER_STEP) return 1.0;
  const steps = Math.floor(nftCount / HOLDING_MULTIPLIER_STEP);
  return 1.0 + steps * HOLDING_MULTIPLIER_BONUS;
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
 * Formula: points = total_hours × POINTS_PER_NFT_PER_HOUR × holding_multiplier
 * Points are rounded to the nearest integer.
 */
export function computePoints(
  totalActiveSeconds: number,
  holdingMultiplier: number
): { points: number; durationDays: number } {
  const durationDays = totalActiveSeconds / 86400;
  const totalHours = totalActiveSeconds / 3600;
  const points = Math.round(totalHours * POINTS_PER_NFT_PER_HOUR * holdingMultiplier);
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
  const { points, durationDays } = computePoints(totalActiveSeconds, holdingMultiplier);

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
