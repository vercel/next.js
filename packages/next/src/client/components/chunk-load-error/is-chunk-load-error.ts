/**
 * Utilities for detecting chunk load errors and network failures.
 *
 * ChunkLoadError can come from:
 * - Turbopack: error.name === 'ChunkLoadError'
 * - Webpack: error.name === 'ChunkLoadError'
 *
 * We intentionally keep detection narrow to avoid false positives:
 * - Server 4xx/5xx responses don't throw (they return Response objects)
 * - We should NOT retry CORS errors, AbortErrors, or parsing failures
 */

/**
 * Detects if an error is a ChunkLoadError from Turbopack or webpack.
 * This is the most reliable check - both bundlers explicitly set this error name.
 */
export function isChunkLoadError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  return (error as Error).name === 'ChunkLoadError'
}

/**
 * Detects network-level request failures that are worth retrying.
 *
 * This intentionally avoids message matching because browser-specific error
 * strings are brittle. For fetch-like APIs, network failures are typically a
 * `TypeError` (or `NetworkError` in some environments).
 */
export function isNetworkError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  const err = error as Error

  // Never retry intentional aborts
  if (err.name === 'AbortError') return false

  return err.name === 'TypeError' || err.name === 'NetworkError'
}

/**
 * Returns true if the error is a chunk load or network error worth retrying.
 */
export function isChunkOrNetworkError(error: unknown): boolean {
  return isChunkLoadError(error) || isNetworkError(error)
}
