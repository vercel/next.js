/**
 * Cache Info Decoding
 *
 * Types and utilities for cache info thenables — the mechanism used to
 * embed lazily-resolved metadata (vary params, cache stage, etc.) into
 * Flight prerender responses.
 *
 * This module is shared between server and client.
 */

export type VaryParams = Set<string>

/**
 * A thenable that follows the React Flight thenable protocol for lazily
 * serializing values into a Flight response stream.
 *
 * On the server, a CacheInfo is created in a 'pending' state,
 * accumulates data during rendering (via the `current` field), and is
 * resolved right before the prerender is aborted.
 *
 * On the client, the thenable arrives from the Flight stream and can be
 * read synchronously via `readCacheInfo()` once the stream is received.
 */
export type CacheInfo<T> = {
  status: string
  value: unknown
} & PromiseLike<T>

/**
 * Synchronously reads a value from a CacheInfo.
 *
 * By the time this is called (client-side or in collectSegmentData), the
 * thenable should already be fulfilled because the Flight stream has been
 * fully received. We check the status synchronously to avoid unnecessary
 * microtasks.
 *
 * Returns null if the thenable is still pending (which shouldn't happen in
 * normal operation - it indicates the server failed to resolve the thenable).
 */
export function readCacheInfo<T>(thenable: CacheInfo<T>): T | null {
  // Attach a no-op listener to force Flight to synchronously resolve the
  // thenable. When a thenable arrives from the Flight stream, it may be in an
  // intermediate 'resolved_model' state (data received but not unwrapped).
  // Calling .then() triggers Flight to transition it to 'fulfilled', making
  // the value available synchronously. React uses this same optimization
  // internally to avoid unnecessary microtasks.
  thenable.then(noop)
  // If the thenable is still not 'fulfilled' after calling .then(), the server
  // failed to resolve it before the stream ended. Treat as unknown.
  if (thenable.status !== 'fulfilled') {
    return null
  }
  return thenable.value as T
}

const noop = () => {}
