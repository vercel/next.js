/**
 * Prewarm the Turbopack dev persistent cache by compiling every entrypoint.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * entrypoints (app + pages routes, pages globals, middleware, instrumentation),
 * compiles each one, periodically flushes the cache to disk in growing
 * batches, and finally shuts the project down so the persistent cache is
 * fully written.
 */

// This must come first as it includes require hooks.
import '../node-environment'
import '../require-hook'

import os from 'os'
import path from 'path'

import type { Endpoint } from '../../build/swc/types'
import * as Log from '../../build/output/log'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import loadConfig from '../config'
import type { TurbopackHotReloader } from '../dev/hot-reloader-turbopack'
import { NEXT_PATCH_SYMBOL } from './patch-fetch'
import { isFileSystemCacheEnabledForDev } from '../../shared/lib/turbopack/utils'
import { traceGlobals } from '../../trace/shared'

// ---------------------------------------------------------------------------
// Constants — tweak these to adjust the prewarm behaviour.
// ---------------------------------------------------------------------------

/**
 * Initial number of concurrent compilations.
 * Grows by 1 after each completed unit, up to MAX_CONCURRENCY.
 */
const INITIAL_CONCURRENCY = 1

/**
 * Maximum number of concurrent compilations.
 * Defaults to the number of logical CPUs on the machine.
 */
const MAX_CONCURRENCY = os.cpus().length

/**
 * Number of units compiled before the Turbopack cache is flushed to disk for
 * the first time (via `project.onExit()`).  The batch size doubles after each
 * intermediate flush, so flushes happen after 10, 30, 70, 150, … units.
 */
const INITIAL_BATCH_SIZE = 10

/**
 * The batch size is multiplied by this factor after every intermediate flush.
 * E.g. 10 → 20 → 40 → …
 */
const BATCH_SIZE_MULTIPLIER = 2

// ---------------------------------------------------------------------------

/**
 * A single thing the prewarm command compiles.  This is either an app/pages
 * router page (compiled via `ensurePage`, which also handles _app/_document
 * for pages routes and other bookkeeping), or a "global" Turbopack endpoint
 * (compiled via `endpoint.writeToDisk()` directly).
 */
type PrewarmUnit =
  | { kind: 'app' | 'pages'; page: string }
  // Pages-router globals: _app, _document, _error.  These are also implicitly
  // compiled when we ensure any pages route, but we list them explicitly so
  // they're prewarmed even when there are no user-defined pages routes.
  | { kind: 'pages-global'; name: string; endpoint: Endpoint }
  // Middleware and instrumentation are eagerly compiled by `handleEntrypoints`
  // during `awaitEntrypoints()`.  We still list them so the count of
  // "prewarmed units" reflects everything that's been seeded.
  | { kind: 'middleware'; endpoint: Endpoint }
  | { kind: 'instrumentation'; runtime: 'nodeJs' | 'edge'; endpoint: Endpoint }

/**
 * Entry point for the prewarm worker.  Throws on fatal errors (no
 * entrypoints discovered, persistent flush failure, etc.) so the parent
 * process can surface them.
 */
export async function prewarmDevServer(opts: { dir: string }): Promise<void> {
  const { dir } = opts

  if (!process.env.NODE_ENV) {
    // @ts-expect-error not readonly
    process.env.NODE_ENV = 'development'
  }

  Log.info('Starting Turbopack dev bundler for cache prewarming…')

  const hotReloader = await setupBundler(dir)

  // Wait for the initial entrypoints subscription to be processed.  This
  // resolves only on the FIRST batch — entrypoints discovered later (e.g.
  // from a slow filesystem scan) won't be included in the snapshot below.
  // For prewarm that's acceptable: any new file is going to need recompile
  // on `next dev` anyway.
  await hotReloader.awaitEntrypoints()

  // Install signal handlers BEFORE starting the long-running compilation
  // loop so a Ctrl+C can flush whatever we've already compiled.
  const abort = installSignalHandlers()

  const units = collectUnits(hotReloader)
  if (units.length === 0) {
    // The project has no entrypoints at all.  This is unexpected — at
    // minimum a Next.js project should expose pages globals.  Treat as
    // a fatal error rather than silently exiting.
    throw new Error(
      'next internal prewarm-dev: no entrypoints discovered in this project. ' +
        'Make sure the project has an `app/` or `pages/` directory.'
    )
  }

  const total = units.length
  Log.info(`Prewarming ${total} entrypoints…`)

  let completed = 0
  let failed = 0
  let concurrency = INITIAL_CONCURRENCY
  let batchSize = INITIAL_BATCH_SIZE
  let lastFlushAt = 0

  // Single-slot serialized flush queue.  Calling `scheduleFlush()` chains a
  // new flush onto the previous one; intermediate flushes never overlap with
  // each other or with the final shutdown.  The first error from any flush
  // is captured and rethrown by `awaitPendingFlush()`.
  let pendingFlush: Promise<void> = Promise.resolve()
  let flushError: unknown

  function scheduleFlush(label: string): void {
    pendingFlush = pendingFlush.then(async () => {
      if (flushError !== undefined) return
      try {
        await persistCache(hotReloader, 'flush')
        Log.info(label)
      } catch (err) {
        flushError = err
      }
    })
  }

  async function awaitPendingFlush(): Promise<void> {
    await pendingFlush
    if (flushError !== undefined) throw flushError
  }

  async function compile(unit: PrewarmUnit): Promise<void> {
    try {
      await compileUnit(hotReloader, unit)
    } catch {
      // Per-unit errors are intentionally not logged: they would clutter
      // output and the count is reported in the final summary.
      failed++
    }
    completed++
    // Grow the concurrency cap by 1 after each completed unit so the first
    // few compiles run sequentially (cheap when the cache is warm) but we
    // ramp up quickly when there's real work to do.
    if (concurrency < MAX_CONCURRENCY) concurrency++
    maybeScheduleFlush()
  }

  function maybeScheduleFlush(): void {
    if (completed - lastFlushAt < batchSize) return
    lastFlushAt = completed
    batchSize = Math.min(batchSize * BATCH_SIZE_MULTIPLIER, total)
    scheduleFlush(
      `Persisted Turbopack cache (${completed} / ${total} entrypoints).`
    )
  }

  await runWithConcurrency(
    units,
    compile,
    () => concurrency,
    abort,
    () => (flushError !== undefined ? flushError : undefined)
  )

  // Wait for any in-flight intermediate flush to finish (and surface any
  // error) before doing the final shutdown.  Calling `project.shutdown()`
  // while a flush is still running can lead to unspecified behaviour per
  // Turbopack's docs.
  await awaitPendingFlush()

  Log.info('Persisting Turbopack cache to disk…')
  await persistCache(hotReloader, 'shutdown')

  if (abort.aborted) {
    Log.warn(
      `Prewarm aborted by signal — persisted cache for ${completed} / ${total} entrypoints.`
    )
    return
  }

  if (failed > 0) {
    Log.warn(
      `Prewarmed ${total - failed} / ${total} entrypoints — ${failed} failed.`
    )
  } else {
    Log.event(`All ${total} entrypoints prewarmed successfully.`)
  }
}

/**
 * Set up the Turbopack dev bundler without starting an HTTP server.
 *
 * Note: this calls into `setupDevBundler`, which:
 *   - records a telemetry session labeled `cliCommand: 'prewarm-dev'`
 *   - acquires the dev lockfile (when `experimental.lockDistDir` is set)
 *     under the owner string `next prewarm-dev`, so an active `next dev`
 *     will refuse to start while a prewarm is running, and vice versa.
 */
async function setupBundler(dir: string): Promise<TurbopackHotReloader> {
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

  if (!isFileSystemCacheEnabledForDev(config)) {
    Log.warn(
      'Turbopack persistent dev cache is not enabled for this project. ' +
        'Prewarming will still compile entrypoints, but no on-disk cache ' +
        'will be written. Enable it with ' +
        '`experimental.turbopackFileSystemCacheForDev: true` in next.config.'
    )
  }

  const distDir = path.join(dir, config.distDir)

  const { Telemetry } =
    require('../../telemetry/storage') as typeof import('../../telemetry/storage')
  const telemetry = new Telemetry({ distDir })
  traceGlobals.set('telemetry', telemetry)

  const fsChecker = await setupFsCheck({
    dev: true,
    dir,
    config,
    minimalMode: false,
  })

  const { pagesDir, appDir } = findPagesDir(dir)

  const originalFetch = globalThis.fetch
  const resetFetch = () => {
    globalThis.fetch = originalFetch
    ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false
  }

  const { setupDevBundler } =
    require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

  const developmentBundler = await setupDevBundler({
    // Prewarm only compiles, never renders, so an empty render server slot
    // (which `setupDevBundler` populates lazily) is enough.
    renderServer: {},
    appDir,
    pagesDir,
    telemetry,
    fsChecker,
    dir,
    nextConfig: config,
    isCustomServer: false,
    turbo: true, // prewarm is Turbopack-only
    port: 0,
    onDevServerCleanup: undefined,
    resetFetch,
    serverFastRefresh: undefined,
    cliCommand: 'prewarm-dev',
  })

  // We forced `turbo: true`, so `developmentBundler.hotReloader` must be a
  // Turbopack hot reloader.  The static type is the narrower
  // `NextJsHotReloaderInterface`; runtime-check the prewarm helpers before
  // narrowing the cast.
  const hotReloader = developmentBundler.hotReloader
  if (!('getCurrentEntrypoints' in hotReloader)) {
    throw new Error(
      '`next internal prewarm-dev` requires Turbopack. ' +
        'Make sure the project is configured to use Turbopack (this is the default).'
    )
  }
  return hotReloader as TurbopackHotReloader
}

/**
 * Snapshot every compilable unit from the Turbopack entrypoints.  Order is
 * stable: globals first (small and shared), then pages routes, then app
 * routes — so the early flushes write commonly-shared chunks.
 */
function collectUnits(hotReloader: TurbopackHotReloader): PrewarmUnit[] {
  const ep = hotReloader.getCurrentEntrypoints()
  const units: PrewarmUnit[] = []

  if (ep.global.middleware) {
    units.push({ kind: 'middleware', endpoint: ep.global.middleware.endpoint })
  }
  if (ep.global.instrumentation) {
    units.push({
      kind: 'instrumentation',
      runtime: 'nodeJs',
      endpoint: ep.global.instrumentation.nodeJs,
    })
    units.push({
      kind: 'instrumentation',
      runtime: 'edge',
      endpoint: ep.global.instrumentation.edge,
    })
  }
  if (ep.global.app) {
    units.push({ kind: 'pages-global', name: '/_app', endpoint: ep.global.app })
  }
  if (ep.global.document) {
    units.push({
      kind: 'pages-global',
      name: '/_document',
      endpoint: ep.global.document,
    })
  }
  if (ep.global.error) {
    units.push({
      kind: 'pages-global',
      name: '/_error',
      endpoint: ep.global.error,
    })
  }

  for (const [page] of ep.page) units.push({ kind: 'pages', page })
  for (const [page] of ep.app) units.push({ kind: 'app', page })

  return units
}

/** Compile a single unit; rejects on compilation failure. */
function compileUnit(
  hotReloader: TurbopackHotReloader,
  unit: PrewarmUnit
): Promise<unknown> {
  switch (unit.kind) {
    case 'app':
    case 'pages':
      return hotReloader.ensurePage({
        page: unit.page,
        clientOnly: false,
        isApp: unit.kind === 'app',
        definition: undefined,
      })
    case 'pages-global':
    case 'middleware':
    case 'instrumentation':
      // Globals don't go through `ensurePage`; we call `writeToDisk()`
      // directly.  This bypasses manifest/issue bookkeeping (we don't need
      // it for prewarm) but still seeds the persistent cache.
      return unit.endpoint.writeToDisk()
    default:
      unit satisfies never
      throw new Error(
        `Unknown prewarm unit kind: ${(unit as PrewarmUnit).kind}`
      )
  }
}

/**
 * Drain `items` through `worker` with an adaptive concurrency limit.  Reads
 * the current cap from `getConcurrency()` on each scheduling pass so the
 * caller can grow the limit as units complete.
 *
 * Worker functions are expected to handle their own errors (this drain loop
 * does not abort on a single rejection).  However the scheduler does abort
 * when:
 *   - `abort.aborted` flips to true (signal received), or
 *   - `getFatalError()` returns a non-undefined value (e.g. a flush failure).
 */
async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  worker: (item: T) => Promise<void>,
  getConcurrency: () => number,
  abort: { aborted: boolean },
  getFatalError: () => unknown
): Promise<void> {
  const queue = [...items]
  const active = new Set<Promise<void>>()

  while (queue.length > 0 || active.size > 0) {
    if (abort.aborted || getFatalError() !== undefined) {
      // Stop scheduling new work.  Wait for in-flight units to finish so
      // the cache is in a consistent state, then return.
      while (active.size > 0) await Promise.race(active)
      const err = getFatalError()
      if (err !== undefined) throw err
      return
    }
    while (queue.length > 0 && active.size < getConcurrency()) {
      const item = queue.shift()!
      const p = worker(item)
        .catch(() => {
          // worker is contractually non-throwing; defensive catch only.
        })
        .finally(() => {
          active.delete(p)
        })
      active.add(p)
    }
    if (active.size > 0) {
      await Promise.race(active)
    }
  }
}

/**
 * Persist the Turbopack cache to disk.
 *
 * - `mode: 'flush'`  – calls `project.onExit()`, which runs the registered
 *   exit handlers (writing the DB to disk) without tearing down turbo-tasks.
 *   Used for intermediate batch persists during prewarm.
 * - `mode: 'shutdown'` – calls `project.shutdown()`, which runs exit handlers
 *   AND waits for turbo-tasks to fully persist.  Called once at the very end.
 */
async function persistCache(
  hotReloader: TurbopackHotReloader,
  mode: 'flush' | 'shutdown'
): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  await (mode === 'shutdown' ? project.shutdown() : project.onExit())
}

/**
 * Install SIGINT/SIGTERM handlers that mark the prewarm as aborted so the
 * scheduler stops queueing new work and the main flow proceeds to a final
 * `project.shutdown()` to persist whatever has been compiled so far.
 *
 * A second signal forces an immediate exit (the persistent cache may be
 * incomplete in that case).
 */
function installSignalHandlers(): { aborted: boolean } {
  const state = { aborted: false }
  let forceCount = 0
  const onSignal = (signal: NodeJS.Signals) => {
    if (state.aborted) {
      forceCount++
      if (forceCount >= 1) {
        Log.warn('Forcing exit — Turbopack cache may be incomplete.')
        process.exit(signal === 'SIGTERM' ? 143 : 130)
      }
      return
    }
    state.aborted = true
    Log.warn(
      `\nReceived ${signal} — finishing in-flight compilations and persisting cache. Press again to force exit.`
    )
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))
  return state
}
