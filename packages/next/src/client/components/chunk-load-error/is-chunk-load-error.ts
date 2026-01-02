/**
 * Utilities for detecting chunk load errors and network failures.
 *
 * ChunkLoadError can come from:
 * - Turbopack: error.name === 'ChunkLoadError'
 * - Webpack: error.name === 'ChunkLoadError'
 */

/**
 * Detects if an error is a ChunkLoadError from Turbopack or webpack.
 */
export function isChunkLoadError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  return (error as Error).name === 'ChunkLoadError'
}

/**
 * Detects network-related errors (fetch failures, offline, etc.)
 */
export function isNetworkError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  const err = error as Error

  // Check for typical network error indicators
  if (err.name === 'TypeError' && err.message?.includes('fetch')) return true
  if (err.message?.includes('NetworkError')) return true
  if (err.message?.includes('Failed to fetch')) return true

  return false
}

/**
 * Returns true if the error is a chunk load or network error.
 */
export function isChunkOrNetworkError(error: unknown): boolean {
  return isChunkLoadError(error) || isNetworkError(error)
}
