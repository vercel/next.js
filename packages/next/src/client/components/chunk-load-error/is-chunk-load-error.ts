/**
 * Utilities for detecting chunk load errors.
 *
 * ChunkLoadError can come from:
 * - Turbopack: error.name === 'ChunkLoadError'
 * - Webpack: error.name === 'ChunkLoadError'
 */

/**
 * Detects if an error is a ChunkLoadError from Turbopack or webpack.
 * This is the most reliable check - both bundlers explicitly set this error name.
 */
export function isChunkLoadError(error: unknown): error is Error {
  if (!error || typeof error !== 'object') return false
  return (error as Error).name === 'ChunkLoadError'
}
