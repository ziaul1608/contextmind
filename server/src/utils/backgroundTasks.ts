const inFlightTasks = new Set<Promise<unknown>>();
const activeExtractionKeys = new Set<string>();

/**
 * Tracks a background promise so it can be cleanly awaited on graceful server shutdown.
 */
export function trackBackgroundTask<T>(promise: Promise<T>): Promise<T> {
  inFlightTasks.add(promise);
  promise.finally(() => {
    inFlightTasks.delete(promise);
  });
  return promise;
}

/**
 * Acquires a non-blocking lock for a specific task key (e.g. extraction per message).
 * Returns true if lock was acquired, false if another identical job is in progress.
 */
export function acquireTaskLock(key: string): boolean {
  if (activeExtractionKeys.has(key)) {
    return false;
  }
  activeExtractionKeys.add(key);
  return true;
}

/**
 * Releases a task lock.
 */
export function releaseTaskLock(key: string): void {
  activeExtractionKeys.delete(key);
}

/**
 * Drains all currently in-flight background promises up to the specified timeout in ms.
 */
export async function drainBackgroundTasks(timeoutMs: number = 5000): Promise<void> {
  if (inFlightTasks.size === 0) return;

  const allTasks = Promise.allSettled(Array.from(inFlightTasks));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));

  await Promise.race([allTasks, timeout]);
}

/**
 * Helper to inspect active background task count (for diagnostics/tests).
 */
export function getActiveBackgroundTaskCount(): number {
  return inFlightTasks.size;
}
