/**
 * Chunk load error handling with silent retry logic.
 *
 * This module provides retry orchestration for chunk/network loading failures.
 * It tracks failures in-memory per {route, chunkKey} and implements a
 * silent retry with jittered backoff.
 */

import { isChunkLoadError, isNetworkError } from './is-chunk-load-error'

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

const RETRY_WINDOW_MS = 30_000 // Don't retry same chunk within 30s of a retry
const MAX_FAIL_COUNT_FOR_RETRY = 2 // After 2 failures, skip silent retry
const KEY_SEPARATOR = '\u0000'

const failureStates = new Map<string, FailureState>()

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
 * Generate a unique key for this chunk error, used for deduplication.
 */
function getChunkKey(ctx: ChunkErrorContext): string {
  return ctx.chunkUrl ?? simpleHash(ctx.message)
}

/**
 * Get the in-memory key for tracking this chunk failure.
 */
function getStateKey(ctx: ChunkErrorContext): string {
  return `${ctx.route}${KEY_SEPARATOR}${getChunkKey(ctx)}`
}

function readFailureState(ctx: ChunkErrorContext): FailureState | null {
  return failureStates.get(getStateKey(ctx)) ?? null
}

function writeFailureState(ctx: ChunkErrorContext, state: FailureState): void {
  failureStates.set(getStateKey(ctx), state)
}

/**
 * Clear failure state for a route (called on successful navigation or explicit retry).
 */
export function clearFailureState(route: string): void {
  const routePrefix = `${route}${KEY_SEPARATOR}`

  for (const key of failureStates.keys()) {
    if (key.startsWith(routePrefix)) {
      failureStates.delete(key)
    }
  }
}

/**
 * Increment the failure count for this chunk.
 */
function bumpFailCount(ctx: ChunkErrorContext): FailureState {
  const existing = readFailureState(ctx)
  const now = Date.now()

  const state: FailureState = {
    failCount: (existing?.failCount ?? 0) + 1,
    lastTs: now,
    retriedTs: existing?.retriedTs,
  }

  writeFailureState(ctx, state)
  return state
}

/**
 * Mark that a retry was attempted for this chunk.
 */
function markRetried(ctx: ChunkErrorContext): void {
  const existing = readFailureState(ctx)
  const now = Date.now()

  const state: FailureState = {
    failCount: existing?.failCount ?? 1,
    lastTs: existing?.lastTs ?? now,
    retriedTs: now,
  }

  writeFailureState(ctx, state)
}

/**
 * Check if we should attempt a silent retry for this chunk error.
 */
export function shouldSilentRetry(ctx: ChunkErrorContext): boolean {
  // Don't retry if offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false
  }

  const state = readFailureState(ctx)
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
  return readFailureState(ctx)?.failCount ?? 0
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
  // and should be retried once connectivity is restored.
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
