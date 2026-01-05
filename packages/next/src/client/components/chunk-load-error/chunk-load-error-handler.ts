/**
 * Chunk load error handling with silent retry logic.
 *
 * This module provides retry orchestration for chunk/network loading failures.
 * It tracks failures in sessionStorage per {route, buildId, chunkKey} and
 * implements silent retry with jittered backoff.
 */

import { getAppBuildId } from '../../app-build-id'
import { isChunkLoadError, isNetworkError } from './is-chunk-load-error'

// Bundler-specific chunk cache clearing globals
declare global {
  var __turbopack_clear_chunk_resolver__:
    | ((chunkUrl: string) => void)
    | undefined
}

/**
 * Context for chunk error handling.
 * Tracks where the error occurred and what kind of error it was.
 */
export interface ChunkErrorContext {
  /** The current route/pathname */
  route: string
  /** Whether this error is blocking a user-visible operation (navigation, render) */
  userVisible: boolean
  /** Error message for generating chunk key */
  message: string
  /** URL of the failed chunk if extractable */
  chunkUrl?: string
}

interface FailureState {
  failCount: number
  lastTs: number
  retriedTs?: number
}

const STORAGE_PREFIX = '__next_chunk_fail:'
const RETRY_WINDOW_MS = 30_000 // Don't retry same chunk within 30s of a retry
const MAX_FAIL_COUNT_FOR_RETRY = 2 // After 2 failures, skip silent retry

/**
 * Simple hash function for generating chunk keys when URL isn't available.
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(36)
}

/**
 * Extract chunk URL from error message if possible.
 * ChunkLoadError messages typically contain the URL.
 */
function extractChunkUrl(error: Error): string | undefined {
  const message = error.message

  // Turbopack format: "Failed to load chunk <url> from <reason>: <cause>"
  // The URL can be relative (/_next/...) or absolute (http://...)
  const turbopackMatch = message.match(
    /Failed to load chunk ([^\s]+\.(?:js|css))/
  )
  if (turbopackMatch) {
    return turbopackMatch[1]
  }

  // Webpack format: "Loading chunk <id> failed. (error: <url>)"
  // Match absolute URLs (http/https), protocol-relative URLs, and relative URLs
  const webpackMatch = message.match(
    /(?:https?:)?\/\/[^\s)]+|\/[^\s)]+\.(?:js|css)/
  )
  return webpackMatch?.[0]
}

/**
 * Clear the bundler's chunk cache so retry will fetch fresh.
 *
 * Note: Webpack automatically clears failed loads from installedChunks
 * (sets to undefined on failure), so no clearing needed there.
 * Turbopack caches rejected promises and needs explicit clearing.
 *
 * @param error - The chunk load error
 * @returns true if cache was cleared, false otherwise
 */
export function clearChunkCache(error: Error): boolean {
  const chunkUrl = extractChunkUrl(error)
  if (!chunkUrl) return false

  // Turbopack: clear by chunk URL
  // (Webpack doesn't need this - it clears installedChunks[chunkId] = undefined on failure)
  if (typeof globalThis.__turbopack_clear_chunk_resolver__ === 'function') {
    // Extract the relative URL path that Turbopack uses as key
    try {
      const url = new URL(chunkUrl)
      globalThis.__turbopack_clear_chunk_resolver__(url.pathname + url.search)
      return true
    } catch {
      // Invalid URL, try using the full URL
      globalThis.__turbopack_clear_chunk_resolver__(chunkUrl)
      return true
    }
  }

  return false
}

/**
 * Generate a unique key for this chunk error, used for deduplication.
 */
function getChunkKey(ctx: ChunkErrorContext): string {
  return ctx.chunkUrl ?? simpleHash(ctx.message)
}

/**
 * Get the sessionStorage key for tracking this chunk failure.
 */
function getStorageKey(ctx: ChunkErrorContext): string {
  const buildId = getAppBuildId()
  const chunkKey = getChunkKey(ctx)
  return `${STORAGE_PREFIX}${buildId}:${ctx.route}:${chunkKey}`
}

/**
 * Read failure state from sessionStorage.
 */
function readFailureState(key: string): FailureState | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const stored = sessionStorage.getItem(key)
    if (!stored) return null
    return JSON.parse(stored) as FailureState
  } catch {
    return null
  }
}

/**
 * Write failure state to sessionStorage.
 */
function writeFailureState(key: string, state: FailureState): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    // Storage might be full or disabled - continue without tracking
  }
}

/**
 * Clear failure state for a route (called on successful navigation).
 */
export function clearFailureState(route: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const buildId = getAppBuildId()
    const prefix = `${STORAGE_PREFIX}${buildId}:${route}:`
    const keysToRemove: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Increment the failure count for this chunk.
 */
function bumpFailCount(ctx: ChunkErrorContext): FailureState {
  const key = getStorageKey(ctx)
  const existing = readFailureState(key)
  const now = Date.now()

  const state: FailureState = {
    failCount: (existing?.failCount ?? 0) + 1,
    lastTs: now,
    retriedTs: existing?.retriedTs,
  }

  writeFailureState(key, state)
  return state
}

/**
 * Mark that a retry was attempted for this chunk.
 */
function markRetried(ctx: ChunkErrorContext): void {
  const key = getStorageKey(ctx)
  const existing = readFailureState(key)
  const now = Date.now()

  const state: FailureState = {
    failCount: existing?.failCount ?? 1,
    lastTs: existing?.lastTs ?? now,
    retriedTs: now,
  }

  writeFailureState(key, state)
}

/**
 * Check if we should attempt a silent retry for this chunk error.
 */
export function shouldSilentRetry(ctx: ChunkErrorContext): boolean {
  // Don't retry if offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false
  }

  const key = getStorageKey(ctx)
  const state = readFailureState(key)
  const now = Date.now()

  // If we already retried within the window, don't retry again
  if (state?.retriedTs && now - state.retriedTs < RETRY_WINDOW_MS) {
    return false
  }

  // Too many failures - skip silent retry to avoid annoying the user
  if ((state?.failCount ?? 0) >= MAX_FAIL_COUNT_FOR_RETRY) {
    return false
  }

  return true
}

/**
 * Get the failure count for this chunk (for showing "hard refresh" hint).
 */
export function getFailCount(ctx: ChunkErrorContext): number {
  const key = getStorageKey(ctx)
  const state = readFailureState(key)
  return state?.failCount ?? 0
}

/**
 * Calculate retry delay with jitter based on RTT.
 * Returns delay in milliseconds: 200 + random(0-400) + min(500, RTT)
 */
export function getRetryDelayMs(): number {
  const baseDelay = 200
  const jitter = Math.floor(Math.random() * 401) // 0-400ms

  // Get RTT if available via Network Information API
  let rtt = 0
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const connection = (navigator as any).connection
    if (connection?.rtt) {
      rtt = Math.min(500, connection.rtt) // Cap at 500ms
    }
  }

  return Math.min(1500, baseDelay + jitter + rtt) // Cap total at 1500ms
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a ChunkErrorContext from an error.
 */
export function createChunkErrorContext(
  error: Error,
  route: string,
  userVisible: boolean = true
): ChunkErrorContext | null {
  if (!isChunkLoadError(error) && !isNetworkError(error)) {
    return null
  }

  return {
    route,
    userVisible,
    message: error.message,
    chunkUrl: extractChunkUrl(error),
  }
}

/**
 * Handle a chunk load failure and determine if we should retry.
 *
 * Returns true if a silent retry should be attempted, false otherwise.
 * This function updates the failure tracking state.
 */
export function handleChunkFailure(ctx: ChunkErrorContext): boolean {
  // Don't count offline failures toward retry limit - they're expected
  // and will succeed once connectivity is restored
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false
  }

  // Record failure for online attempts
  bumpFailCount(ctx)

  // Check if we should try a silent retry
  if (shouldSilentRetry(ctx)) {
    markRetried(ctx)
    return true
  }

  return false
}

/**
 * Attempt to retry a failed chunk import.
 *
 * @param ctx - The chunk error context
 * @param importFn - The function that performs the import
 * @returns The result of the import, or throws if retry also fails
 */
export async function retryChunkImport<T>(
  ctx: ChunkErrorContext,
  importFn: () => Promise<T>
): Promise<T> {
  const shouldRetry = handleChunkFailure(ctx)

  if (shouldRetry) {
    const delay = getRetryDelayMs()
    await sleep(delay)
    return importFn()
  }

  // If we shouldn't retry, re-throw to trigger error boundary
  throw new Error('Chunk load failed after retry attempts')
}
