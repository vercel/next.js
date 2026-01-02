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
 * Detects network-level fetch failures that are worth retrying.
 *
 * We're intentionally conservative here to avoid retrying errors that won't benefit:
 * - AbortError: Intentional cancellation, should not retry
 * - CORS errors: Configuration issue, retry won't help
 * - Server errors: These don't throw (return Response), but if they did, retry might not help
 *
 * We only catch errors that indicate the network request itself failed,
 * not errors from processing the response.
 */
export function isNetworkError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  const err = error as Error

  // Never retry intentional aborts
  if (err.name === 'AbortError') return false

  // TypeError with specific fetch failure messages
  // These occur when the network request itself fails (not CORS, not server error)
  if (err.name === 'TypeError') {
    const message = err.message || ''
    // Browser-specific network failure messages
    // Chrome/Edge: "Failed to fetch"
    // Firefox: "NetworkError when attempting to fetch resource"
    // Safari: "Load failed" or "The Internet connection appears to be offline"
    if (
      message === 'Failed to fetch' ||
      message.startsWith('NetworkError when attempting to fetch') ||
      message === 'Load failed' ||
      message.includes('Internet connection appears to be offline') ||
      message.includes('network connection was lost')
    ) {
      return true
    }
  }

  return false
}

/**
 * Returns true if the error is a chunk load or network error worth retrying.
 */
export function isChunkOrNetworkError(error: unknown): boolean {
  return isChunkLoadError(error) || isNetworkError(error)
}
