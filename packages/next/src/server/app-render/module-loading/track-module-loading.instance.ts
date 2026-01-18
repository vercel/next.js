import { CacheSignal } from '../cache-signal'
import { isThenable } from '../../../shared/lib/is-thenable'

/**
 * Tracks all in-flight async imports and chunk loads.
 * Initialized lazily, because we don't want this to error in case it gets pulled into an edge runtime module.
 */
let _moduleLoadingSignal: CacheSignal | null
let _totalChunkCount = 0
let _totalImportCount = 0
let _activeChunkCount = 0
let _activeImportCount = 0
let _maxConcurrentChunks = 0
let _maxConcurrentImports = 0

// Deduplication stats (for early logging)
let _deduplicatedCount = 0
let _totalDuplicateRequests = 0
let _lastStatsLogAt = 0

// Threshold for logging slow chunk/import loads (in milliseconds)
const SLOW_LOAD_THRESHOLD_MS = 100

// Interval for periodic stats logging (every N chunks)
const STATS_LOG_INTERVAL = 100

// Track in-flight chunks to detect duplicate loads
const _inFlightChunks = new Map<
  string | number,
  { count: number; startTime: number }
>()
// Track completed chunk loads with timing info
const _chunkLoadHistory = new Map<
  string | number,
  { loadCount: number; totalTime: number; firstLoadTime: number }
>()

function logPeriodicStats() {
  const now = _totalChunkCount
  if (now - _lastStatsLogAt >= STATS_LOG_INTERVAL) {
    _lastStatsLogAt = now
    const uniqueChunks = _chunkLoadHistory.size
    const duplicateRatio =
      _totalChunkCount > 0
        ? ((_totalChunkCount - uniqueChunks) / _totalChunkCount) * 100
        : 0
    console.log(
      `[module-loading] STATS @${_totalChunkCount} chunks: unique=${uniqueChunks}, duplicateRequests=${_totalDuplicateRequests}, deduplicatedByCache=${_deduplicatedCount}, duplicateRatio=${duplicateRatio.toFixed(1)}%, maxConcurrent=${_maxConcurrentChunks}, active=${_activeChunkCount}`
    )
  }
}

function getModuleLoadingSignal() {
  if (!_moduleLoadingSignal) {
    _moduleLoadingSignal = new CacheSignal()
  }
  return _moduleLoadingSignal
}

export function getModuleLoadingStats() {
  return {
    totalChunks: _totalChunkCount,
    totalImports: _totalImportCount,
    activeChunks: _activeChunkCount,
    activeImports: _activeImportCount,
    maxConcurrentChunks: _maxConcurrentChunks,
    maxConcurrentImports: _maxConcurrentImports,
    deduplicatedCount: _deduplicatedCount,
    totalDuplicateRequests: _totalDuplicateRequests,
    uniqueChunks: _chunkLoadHistory.size,
  }
}

export function trackChunkDeduplicated(chunkId: string | number) {
  _deduplicatedCount++
  // Log immediately for early visibility
  if (_deduplicatedCount === 1) {
    console.log(
      `[module-loading] DEDUP: First chunk deduplicated [${chunkId}] at ${performance.now().toFixed(2)}ms`
    )
  } else if (_deduplicatedCount % 50 === 0) {
    console.log(
      `[module-loading] DEDUP: ${_deduplicatedCount} chunks deduplicated so far (latest: ${chunkId})`
    )
  }
}

export function logChunkLoadingSummary() {
  const duplicateChunks: Array<{
    chunkId: string | number
    loadCount: number
    totalTime: number
  }> = []

  for (const [chunkId, history] of _chunkLoadHistory) {
    if (history.loadCount > 1) {
      duplicateChunks.push({
        chunkId,
        loadCount: history.loadCount,
        totalTime: history.totalTime,
      })
    }
  }

  if (duplicateChunks.length > 0) {
    duplicateChunks.sort((a, b) => b.loadCount - a.loadCount)
    console.log(
      `[module-loading] SUMMARY: ${duplicateChunks.length} chunks loaded multiple times:`
    )
    for (const chunk of duplicateChunks.slice(0, 10)) {
      console.log(
        `  - ${chunk.chunkId}: ${chunk.loadCount}x, total ${chunk.totalTime.toFixed(2)}ms`
      )
    }
  }

  console.log(
    `[module-loading] SUMMARY: maxConcurrentChunks=${_maxConcurrentChunks}, maxConcurrentImports=${_maxConcurrentImports}, uniqueChunks=${_chunkLoadHistory.size}, totalLoads=${_totalChunkCount}`
  )
}

export function trackPendingChunkLoad(
  promise: Promise<unknown>,
  chunkId?: string | number,
  renderContext?: string,
  phase?: string
) {
  const moduleLoadingSignal = getModuleLoadingSignal()
  const chunkIndex = _totalChunkCount
  _totalChunkCount++
  _activeChunkCount++

  if (_activeChunkCount > _maxConcurrentChunks) {
    _maxConcurrentChunks = _activeChunkCount
  }

  const startTime = performance.now()
  const contextInfo = renderContext
    ? ` [context: ${renderContext}${phase ? '/' + phase : ''}]`
    : ''

  // Track in-flight chunks to detect concurrent duplicate loads
  let isDuplicateInFlight = false
  if (chunkId !== undefined) {
    const existing = _inFlightChunks.get(chunkId)
    if (existing) {
      existing.count++
      isDuplicateInFlight = true
      _totalDuplicateRequests++
      console.log(
        `[module-loading] DUPLICATE in-flight chunk #${chunkIndex} [${chunkId}]${contextInfo} - ${existing.count} concurrent loads at ${startTime.toFixed(2)}ms`
      )
    } else {
      _inFlightChunks.set(chunkId, { count: 1, startTime })
    }
  }

  // Log periodic stats for early visibility
  logPeriodicStats()

  const trackedPromise = moduleLoadingSignal.trackRead(promise)
  trackedPromise.then(
    () => {
      _activeChunkCount--
      const loadTime = performance.now() - startTime

      // Update in-flight tracking
      if (chunkId !== undefined) {
        const existing = _inFlightChunks.get(chunkId)
        if (existing) {
          existing.count--
          if (existing.count === 0) {
            _inFlightChunks.delete(chunkId)
          }
        }

        // Update history
        const history = _chunkLoadHistory.get(chunkId)
        if (history) {
          history.loadCount++
          history.totalTime += loadTime
        } else {
          _chunkLoadHistory.set(chunkId, {
            loadCount: 1,
            totalTime: loadTime,
            firstLoadTime: startTime,
          })
        }
      }

      if (loadTime > SLOW_LOAD_THRESHOLD_MS) {
        const chunkInfo = chunkId ? ` [${chunkId}]` : ''
        const dupInfo = isDuplicateInFlight ? ' (was duplicate)' : ''
        console.log(
          `[module-loading] Slow chunk load #${chunkIndex}${chunkInfo}${contextInfo}${dupInfo} completed in ${loadTime.toFixed(2)}ms (threshold: ${SLOW_LOAD_THRESHOLD_MS}ms)`
        )
      }
    },
    () => {
      _activeChunkCount--
      const loadTime = performance.now() - startTime

      // Update in-flight tracking
      if (chunkId !== undefined) {
        const existing = _inFlightChunks.get(chunkId)
        if (existing) {
          existing.count--
          if (existing.count === 0) {
            _inFlightChunks.delete(chunkId)
          }
        }
      }

      const chunkInfo = chunkId ? ` [${chunkId}]` : ''
      console.log(
        `[module-loading] Chunk load #${chunkIndex}${chunkInfo}${contextInfo} FAILED after ${loadTime.toFixed(2)}ms`
      )
    }
  )
}

export function trackPendingImport(
  exportsOrPromise: unknown,
  moduleId?: string | number,
  renderContext?: string,
  phase?: string
) {
  const moduleLoadingSignal = getModuleLoadingSignal()
  const contextInfo = renderContext
    ? ` [context: ${renderContext}${phase ? '/' + phase : ''}]`
    : ''

  // requiring an async module returns a promise.
  // if it's sync, there's nothing to track.
  if (isThenable(exportsOrPromise)) {
    // A client reference proxy might look like a promise, but we can only call `.then()` on it, not e.g. `.finally()`.
    // Turn it into a real promise to avoid issues elsewhere.
    const promise = Promise.resolve(exportsOrPromise)
    const importIndex = _totalImportCount
    _totalImportCount++
    _activeImportCount++

    if (_activeImportCount > _maxConcurrentImports) {
      _maxConcurrentImports = _activeImportCount
    }

    const startTime = performance.now()

    const trackedPromise = moduleLoadingSignal.trackRead(promise)
    trackedPromise.then(
      () => {
        _activeImportCount--
        const loadTime = performance.now() - startTime
        if (loadTime > SLOW_LOAD_THRESHOLD_MS) {
          const moduleInfo = moduleId ? ` [${moduleId}]` : ''
          console.log(
            `[module-loading] Slow import #${importIndex}${moduleInfo}${contextInfo} completed in ${loadTime.toFixed(2)}ms (threshold: ${SLOW_LOAD_THRESHOLD_MS}ms)`
          )
        }
      },
      () => {
        _activeImportCount--
        const loadTime = performance.now() - startTime
        const moduleInfo = moduleId ? ` [${moduleId}]` : ''
        console.log(
          `[module-loading] Import #${importIndex}${moduleInfo}${contextInfo} FAILED after ${loadTime.toFixed(2)}ms`
        )
      }
    )
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
