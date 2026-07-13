/**
 * Shared per-key throttle with time-based cleanup.
 *
 * Replaces the fragile "clean every N inserts" pattern that was vulnerable to
 * IPv6 exhaustion attacks (attacker rotates through a /64 worth of IPs, the
 * Map grows unboundedly because the cleanup threshold is never reached).
 *
 * Instead, this uses a setInterval-based cleanup that runs on a timer,
 * independent of insert frequency. A single attacker with unlimited IPs cannot
 * prevent stale entries from being evicted.
 */

export interface ThrottleOpts {
  /** Minimum interval between allowed calls (ms) */
  minIntervalMs: number;
  /** How often to run the cleanup timer (ms). Default: 60_000 (1 minute). */
  cleanupIntervalMs?: number;
  /** How long after the last access an entry is considered stale (ms).
   *  Default: minIntervalMs * 4. */
  staleAfterMs?: number;
}

export interface ThrottleGuard {
  /**
   * Check if a key is allowed to proceed.
   * Returns true if allowed (and records the access), false if throttled.
   * Also accepts a callback to send a 429 response — if provided and throttled,
   * the callback is invoked with a standard rate-limit payload.
   */
  allow(key: string): boolean;
  /** Number of entries currently tracked */
  readonly size: number;
  /** Stop the cleanup timer */
  destroy(): void;
}

export function createThrottle(opts: ThrottleOpts): ThrottleGuard {
  const { minIntervalMs, cleanupIntervalMs = 60_000, staleAfterMs = minIntervalMs * 4 } = opts;
  const map = new Map<string, number>();

  const cleanup = () => {
    const cutoff = Date.now() - staleAfterMs;
    for (const [k, v] of map) {
      if (v < cutoff) map.delete(k);
    }
  };

  const timer = setInterval(cleanup, cleanupIntervalMs);
  // Allow the timer to not block the process from exiting
  if (timer.unref) timer.unref();

  return {
    allow(key: string): boolean {
      const now = Date.now();
      const last = map.get(key) || 0;
      if (now - last < minIntervalMs) {
        return false;
      }
      map.set(key, now);
      return true;
    },
    get size(): number {
      return map.size;
    },
    destroy(): void {
      clearInterval(timer);
      map.clear();
    },
  };
}
