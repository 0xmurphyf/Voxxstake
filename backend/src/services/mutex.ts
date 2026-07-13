/**
 * Per-key async mutex — ensures only one async operation per key is in-flight.
 *
 * Used to prevent background sync and user-triggered sync from interleaving on
 * the same Sui address (both do find→modify→save and the second writer would
 * overwrite the first).
 */

const locks = new Map<string, Promise<unknown>>();

export async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any in-flight operation on this key to settle.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pending = locks.get(key);
    if (!pending) break;
    try { await pending; } catch { /* previous op failed — proceed */ }
  }

  const promise = fn().finally(() => {
    if (locks.get(key) === promise) locks.delete(key);
  });
  locks.set(key, promise);
  return promise;
}
