/**
 * Per-key async mutex — ensures only one async operation per key is in-flight.
 *
 * Used to prevent background sync and user-triggered sync from interleaving on
 * the same Sui address (both do find→modify→save and the second writer would
 * overwrite the first).
 *
 * Each critical section has a configurable timeout (default 90s). If `fn()`
 * does not settle within that window, the CALLER receives a timeout error, but
 * the lock remains held until fn() actually finishes — preventing overlapping
 * critical sections. A subsequent caller will wait for the timed-out fn() to
 * settle before entering.
 */

const DEFAULT_MUTEX_TIMEOUT_MS = 90_000;

const locks = new Map<string, Promise<unknown>>();

export async function withMutex<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_MUTEX_TIMEOUT_MS
): Promise<T> {
  // Wait for any in-flight operation on this key to settle.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pending = locks.get(key);
    if (!pending) break;
    try { await pending; } catch { /* previous op failed — proceed */ }
  }

  // The lock follows fn()'s lifecycle — it is only released when fn() truly
  // settles (success or failure). The timeout races against fn() for the
  // CALLER's benefit only: if fn() takes too long the caller gets a rejection,
  // but the lock stays held, preventing overlapping critical sections.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Mutex timeout after ${timeoutMs}ms for key ${key.slice(0, 12)}...`)),
      timeoutMs
    );
  });

  const opPromise = fn().finally(() => {
    clearTimeout(timeoutId);
    if (locks.get(key) === opPromise) locks.delete(key);
  });

  locks.set(key, opPromise);
  return Promise.race([opPromise, timeoutPromise]);
}
