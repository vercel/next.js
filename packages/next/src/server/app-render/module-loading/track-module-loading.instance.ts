import { CacheSignal } from '../cache-signal'
import { isThenable } from '../../../shared/lib/is-thenable'

/**
 * Tracks all in-flight async imports and chunk loads.
 * Initialized lazily, because we don't want this to error in case it gets pulled into an edge runtime module.
 */
let _moduleLoadingSignal: CacheSignal | null
function getModuleLoadingSignal() {
  if (!_moduleLoadingSignal) {
    _moduleLoadingSignal = new CacheSignal()
  }
  return _moduleLoadingSignal
}

// Track all chunk IDs that have ever been tracked in this process.
// Once a chunk is loaded in Node.js, it stays loaded (module caching).
// Subsequent requests for the same chunk are instant and don't need tracking.
// This prevents duplicate tracking across server/client prerender phases.
const _trackedChunks = new Set<string>()

export function trackPendingChunkLoad(
  promise: Promise<unknown>,
  chunkId?: string | number
) {
  const chunkIdStr = chunkId !== undefined ? String(chunkId) : undefined

  // Deduplicate by chunk ID - if this chunk was already tracked, skip it.
  // This is safe because Node.js caches modules, so subsequent "loads" are instant.
  // We intentionally do NOT remove from the Set after completion - once tracked, always tracked.
  if (chunkIdStr !== undefined && _trackedChunks.has(chunkIdStr)) {
    return
  }
  if (chunkIdStr !== undefined) {
    _trackedChunks.add(chunkIdStr)
  }

  const moduleLoadingSignal = getModuleLoadingSignal()
  moduleLoadingSignal.trackRead(promise)
}

export function trackPendingImport(exportsOrPromise: unknown) {
  const moduleLoadingSignal = getModuleLoadingSignal()

  // requiring an async module returns a promise.
  // if it's sync, there's nothing to track.
  if (isThenable(exportsOrPromise)) {
    // A client reference proxy might look like a promise, but we can only call `.then()` on it, not e.g. `.finally()`.
    // Turn it into a real promise to avoid issues elsewhere.
    const promise = Promise.resolve(exportsOrPromise)
    moduleLoadingSignal.trackRead(promise)
  }
}

/**
 * A top-level dynamic import (or chunk load):
 *
 *   1. delays a prerender (potentially for a task or longer)
 *   2. may reveal more caches that need be filled
 *
 * So if we see one, we want to extend the duration of `cacheSignal` at least until the import/chunk-load is done.
 */
export function trackPendingModules(cacheSignal: CacheSignal): void {
  const moduleLoadingSignal = getModuleLoadingSignal()

  // We can't just use `cacheSignal.trackRead(moduleLoadingSignal.cacheReady())`,
  // because we might start and finish multiple batches of module loads while waiting for caches,
  // and `moduleLoadingSignal.cacheReady()` would resolve after the first batch.
  // Instead, we'll keep notifying `cacheSignal` of each import/chunk-load.
  const unsubscribe = moduleLoadingSignal.subscribeToReads(cacheSignal)

  // Later, when `cacheSignal` is no longer waiting for any caches (or imports that we've notified it of),
  // we can unsubscribe it.
  cacheSignal.cacheReady().then(unsubscribe)
}
