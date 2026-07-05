import { IStake } from '../models/Stake';
import { Tier, StakingPosition, BASE_POINTS_PER_DAY } from '../types';

export const DEFAULT_TIERS: Tier[] = [
  { name: 'Bronze', multiplier: 1.0, min_days: 0, apy: 10.0 },
  { name: 'Silver', multiplier: 1.5, min_days: 7, apy: 15.0 },
  { name: 'Gold', multiplier: 2.0, min_days: 30, apy: 20.0 },
  { name: 'Platinum', multiplier: 3.0, min_days: 90, apy: 30.0 },
];

/**
 * Get the tier for a given staking duration.
 *
 * TIER RULES:
 *   The tier is determined by the TOTAL staking duration (all sessions
 *   combined). The entire holding period is recalculated at the new tier's
 *   multiplier — not just the time spent above the threshold.
 *
 *   Example: A user stakes for 8 days.
 *     - Days 1-7: 7 × 10 × 1.0  (Bronze)
 *     - Days 7-8: 1 × 10 × 1.5  (Silver)
 *     Total = 70 + 15 = 85  ← WRONG (if "only above threshold")
 *
 *     ACTUAL behavior: the ENTIRE 8 days × 1.5 = 120 points
 *     This rewards long-term holders with a bonus on all past time.
 *
 * Sorts tiers descending by min_days, returns first match.
 */
export function getTierForDuration(durationDays: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => b.min_days - a.min_days);
  for (const tier of sorted) {
    if (durationDays >= tier.min_days) return tier;
  }
  return sorted[sorted.length - 1] || DEFAULT_TIERS[0];
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
 * Compute lore points, duration, and tier from total active seconds.
 *
 * Points are rounded to the nearest integer for consistent frontend/backend
 * comparison. Floating-point drift from fractional seconds is avoided.
 *
 * Formula: points = round(durationDays × BASE_POINTS_PER_DAY × tier.multiplier)
 */
export function computePoints(
  totalActiveSeconds: number,
  tiers: Tier[]
): { points: number; durationDays: number; tier: Tier } {
  const durationDays = totalActiveSeconds / 86400;
  const tier = getTierForDuration(durationDays, tiers);
  // Round to integer for consistency — avoids floating-point mismatches
  const points = Math.round(durationDays * BASE_POINTS_PER_DAY * tier.multiplier);
  return { points, durationDays, tier };
}

/**
 * Build a StakingPosition from a stake document.
 */
export function buildPositionFromStake(
  stake: IStake,
  tiers: Tier[],
  ownedSet: Set<string> | null
): StakingPosition {
  const now = new Date();
  const totalActiveSeconds = computeTotalActiveSeconds(stake, now);
  const { points, durationDays, tier } = computePoints(totalActiveSeconds, tiers);

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
    tier: tier.name,
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
  sellAlerts: string[]
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
    positions: sorted,
    sell_alerts: sellAlerts,
  };
}
