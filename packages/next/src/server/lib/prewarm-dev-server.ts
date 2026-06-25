/**
 * Prewarm the Turbopack dev persistent cache by compiling every entrypoint.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * entrypoints (app + pages routes, pages globals when there are pages routes,
 * middleware, instrumentation), compiles each one, periodically flushes the
 * cache to disk in growing batches, and finally shuts the project down so the
 * persistent cache is fully written.
 */

// This must come first as it includes require hooks.
import '../node-environment'
import '../require-hook'

import os from 'os'

import type { Endpoint } from '../../build/swc/types'
import * as Log from '../../build/output/log'
import { setupFsCheck } from './router-utils/filesystem'
import { PHASE_DEVELOPMENT_SERVER } from '../../shared/lib/constants'
import loadConfig from '../config'
import type { TurbopackHotReloader } from '../dev/hot-reloader-turbopack'
import { isFileSystemCacheEnabledForDev } from '../../shared/lib/turbopack/utils'
import { runWithConcurrency } from '../../lib/run-with-concurrency'

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
  // Pages-router globals: _app, _document, _error.  Only emitted when the
  // project has user-defined pages routes; for app-only projects these
  // would compile unused defaults.
  | { kind: 'pages-global'; name: string; endpoint: Endpoint }

/**
 * Entry point for the prewarm worker.  Throws on fatal errors (no
 * entrypoints discovered, persistent flush failure, etc.) so the parent
 * process can surface them.
 */
export async function prewarmDevServer(opts: { dir: string }): Promise<void> {
  const { dir } = opts

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = 'development'
  }

  // Hard-exit on Ctrl+C: we want to abandon any in-flight compilation
  // immediately rather than try to gracefully persist.  An interrupted
  // prewarm leaves the cache empty (or only partially seeded if a flush
  // already happened), which is fine — the user will just rerun the
  // command.
  installHardExitSignalHandlers()

  Log.info('Starting Turbopack dev bundler for cache prewarming…')

  const hotReloader = await setupBundler(dir)

  // Wait for the initial entrypoints subscription to be processed.  This
  // resolves only on the FIRST batch — entrypoints discovered later (e.g.
  // from a slow filesystem scan) won't be included in the snapshot below.
  // For prewarm that's acceptable: any new file is going to need recompile
  // on `next dev` anyway.
  await hotReloader.awaitEntrypoints()

  // Middleware and instrumentation are eagerly compiled by `handleEntrypoints`
  // during `awaitEntrypoints()` above, so they're already part of the cache.
  // We track that count here so the final summary reflects everything that
  // has been seeded without triggering redundant `writeToDisk()` calls.
  const ep = hotReloader.getCurrentEntrypoints()
  let prewarmedDuringSetup = 0
  if (ep.global.middleware) prewarmedDuringSetup++
  if (ep.global.instrumentation) prewarmedDuringSetup += 2 // nodeJs + edge

  const units = collectUnits(hotReloader)
  if (units.length === 0 && prewarmedDuringSetup === 0) {
    // The project has no entrypoints at all.  This is unexpected — at
    // minimum a Next.js project should expose pages globals or an app dir.
    throw new Error(
      'next internal prewarm-dev: no entrypoints discovered in this project. ' +
        'Make sure the project has an `app/` or `pages/` directory.'
    )
  }

  const total = units.length + prewarmedDuringSetup
  Log.info(`Prewarming ${total} entrypoints…`)

  let completed = prewarmedDuringSetup
  let failed = 0
  let concurrency = INITIAL_CONCURRENCY
  let batchSize = INITIAL_BATCH_SIZE
  let lastFlushAt = completed

  // Single-slot serialised flush queue.  Calling `scheduleFlush()` chains a
  // new flush onto the previous one; intermediate flushes never overlap with
  // each other or with the final shutdown.  The first error from any flush
  // is captured, aborts the scheduling loop, and is rethrown by
  // `awaitPendingFlush()`.
  let pendingFlush: Promise<void> = Promise.resolve()
  const fatalError = new AbortController()

  function scheduleFlush(label: string): void {
    pendingFlush = pendingFlush.then(async () => {
      if (fatalError.signal.aborted) return
      try {
        await persistCache(hotReloader, 'flush')
        Log.info(label)
      } catch (err) {
        fatalError.abort(err)
      }
    })
  }

  async function awaitPendingFlush(): Promise<void> {
    await pendingFlush
    if (fatalError.signal.aborted) throw fatalError.signal.reason
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
    if (completed - lastFlushAt >= batchSize) {
      lastFlushAt = completed
      batchSize = Math.min(batchSize * BATCH_SIZE_MULTIPLIER, total)
      scheduleFlush(
        `Persisted Turbopack cache (${completed} / ${total} entrypoints).`
      )
    }
  }

  // Always run the final shutdown — even when the scheduling loop aborts
  // (e.g. on a flush failure) we still want to persist whatever made it
  // into the cache, mirroring `turbopack-build/impl.ts`.
  let runError: unknown
  try {
    await runWithConcurrency(units, compile, {
      getConcurrency: () => concurrency,
      signal: fatalError.signal,
    })
    await awaitPendingFlush()
  } catch (err) {
    runError = err
  }

  Log.info('Persisting Turbopack cache to disk…')
  try {
    await persistCache(hotReloader, 'shutdown')
  } catch (shutdownErr) {
    if (runError === undefined) runError = shutdownErr
  }
  if (runError !== undefined) throw runError

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
 * Note: the underlying `bootstrapDevBundler` helper:
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

  const fsChecker = await setupFsCheck({
    dev: true,
    dir,
    config,
    minimalMode: false,
  })

  // Force Turbopack for prewarm.  `bootstrapDevBundler` reads `TURBOPACK`
  // from the env, which the CLI already sets, but we're defensive here.
  process.env.TURBOPACK = '1'

  const originalFetch = globalThis.fetch
  const resetFetch = () => {
    globalThis.fetch = originalFetch
  }

  const { bootstrapDevBundler } =
    require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

  const { developmentBundler } = await bootstrapDevBundler({
    dir,
    config,
    fsChecker,
    // Prewarm only compiles, never renders, so an empty render server slot
    // (which `setupDevBundler` populates lazily) is enough.
    renderServer: {},
    port: 0,
    cliCommand: 'prewarm-dev',
    resetFetch,
  })

  // We forced `TURBOPACK=1`, so `developmentBundler.hotReloader` must be a
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
 * stable: pages globals first (small and shared), then pages routes, then
 * app routes — so the early flushes write commonly-shared chunks.
 *
 * Middleware and instrumentation are NOT included here; they are eagerly
 * compiled by `handleEntrypoints` during `awaitEntrypoints()` and don't need
 * a second `writeToDisk()` call.
 */
function collectUnits(hotReloader: TurbopackHotReloader): PrewarmUnit[] {
  const ep = hotReloader.getCurrentEntrypoints()
  const units: PrewarmUnit[] = []

  // Only prewarm pages globals if the project actually has pages routes,
  // otherwise we'd compile unused default _app/_document/_error stubs in
  // app-only projects.
  const hasPagesRoutes = ep.page.size > 0
  if (hasPagesRoutes) {
    if (ep.global.app) {
      units.push({
        kind: 'pages-global',
        name: '/_app',
        endpoint: ep.global.app,
      })
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
      // Globals don't go through `ensurePage`; we call `writeToDisk()`
      // directly.  This bypasses manifest/issue bookkeeping (we don't need
      // it for prewarm) but still seeds the persistent cache.
      return unit.endpoint.writeToDisk()
    default: {
      const _exhaustive: never = unit
      const kind = (_exhaustive as { kind: string }).kind
      throw new Error(`Unknown prewarm unit kind: ${kind}`)
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
 * Install SIGINT/SIGTERM handlers that exit the worker immediately.  We do
 * not attempt to gracefully persist on signal — Ctrl+C should feel like
 * Ctrl+C — so the cache is left in whatever state the most recent flush
 * reached.
 */
function installHardExitSignalHandlers(): void {
  const onSignal = (signal: NodeJS.Signals) => {
    process.exit(signal === 'SIGTERM' ? 143 : 130)
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))
}
