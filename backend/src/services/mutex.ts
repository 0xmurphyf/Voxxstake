/**
 * Per-key async mutex — ensures only one async operation per key is in-flight.
 *
 * Used to prevent background sync and user-triggered sync from interleaving on
 * the same Sui address (both do find→modify→save and the second writer would
 * overwrite the first).
 *
 * Each critical section has a configurable timeout (default 90s). If `fn()`
 * does not settle within that window, the lock is released and the caller
 * receives a timeout error. This prevents a single hung RPC or MongoDB
 * operation from permanently deadlocking all sync operations for one address.
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

  // Wrap fn() in a timeout so a hung operation (RPC stall, MongoDB connection
  // drop) doesn't hold the lock forever.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Mutex timeout after ${timeoutMs}ms for key ${key.slice(0, 12)}...`)),
      timeoutMs
    );
  });

  const promise = Promise.race([fn(), timeoutPromise])
    .finally(() => {
      clearTimeout(timeoutId);
      if (locks.get(key) === promise) locks.delete(key);
    });

  locks.set(key, promise);
  return promise;
}
