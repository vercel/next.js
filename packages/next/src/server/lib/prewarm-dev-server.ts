/**
 * Prewarm the Turbopack dev persistent cache by compiling every route.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * routes, calls `ensurePage` for each one, periodically flushes the cache to
 * disk, and finally shuts the project down so the persistent cache is fully
 * written.
 */

// This must come first as it includes require hooks.
import '../node-environment'
import '../require-hook'

import os from 'os'
import path from 'path'

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
 * Initial number of concurrent `ensurePage` calls.
 * Grows by 1 after each completed route, up to MAX_CONCURRENCY.
 */
const INITIAL_CONCURRENCY = 1

/**
 * Maximum number of concurrent `ensurePage` calls.
 * Defaults to the number of logical CPUs on the machine.
 */
const MAX_CONCURRENCY = os.cpus().length

/**
 * Number of routes compiled before the Turbopack cache is flushed to disk for
 * the first time (via `project.onExit()`).  The batch size doubles after each
 * intermediate flush, so flushes happen after 10, 30, 70, 150, … routes.
 */
const INITIAL_BATCH_SIZE = 10

/**
 * The batch size is multiplied by this factor after every intermediate flush.
 * E.g. 10 → 20 → 40 → …
 */
const BATCH_SIZE_MULTIPLIER = 2

// ---------------------------------------------------------------------------

type RouteEntry = { page: string; isApp: boolean }

const kindLabel = (isApp: boolean) => (isApp ? 'app' : 'pages')

const formatError = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

export async function prewarmDevServer(opts: { dir: string }): Promise<void> {
  const { dir } = opts

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = 'development'
  }

  Log.info('Starting Turbopack dev bundler for cache prewarming…')

  const hotReloader = await setupBundler(dir)

  // Wait for the initial entrypoints to be populated, then snapshot all routes.
  await hotReloader.awaitEntrypoints()
  const routes = collectRoutes(hotReloader)
  const total = routes.length

  if (total === 0) {
    Log.info('No routes found — nothing to prewarm.')
    await persistCache(hotReloader, 'shutdown')
    return
  }

  Log.info(`Prewarming ${total} routes…`)

  const errors: Array<{ page: string; err: unknown }> = []
  let completed = 0
  let concurrency = INITIAL_CONCURRENCY
  let batchSize = INITIAL_BATCH_SIZE
  // Number of completed routes at the time of the last cache flush.
  let lastFlushAt = 0

  function ensureRoute(entry: RouteEntry): Promise<void> {
    return hotReloader
      .ensurePage({
        page: entry.page,
        clientOnly: false,
        isApp: entry.isApp,
        definition: undefined,
      })
      .then(
        () => Log.event(`  ✓  ${entry.page}  (${kindLabel(entry.isApp)})`),
        (err: unknown) => {
          Log.error(
            `  ✗  ${entry.page}  (${kindLabel(entry.isApp)}): ${formatError(err)}`
          )
          errors.push({ page: entry.page, err })
        }
      )
      .then(() => {
        completed++
        // Grow concurrency after each completed route, up to the maximum.
        if (concurrency < MAX_CONCURRENCY) concurrency++
        process.stdout.write(`\r  [${completed} / ${total} routes compiled]`)

        // Flush to disk after every batch using onExit() which persists
        // without tearing down the Turbopack project.
        if (completed - lastFlushAt >= batchSize) {
          lastFlushAt = completed
          batchSize = Math.min(batchSize * BATCH_SIZE_MULTIPLIER, total)
          persistCache(hotReloader, 'flush').catch(Log.error)
        }
      })
  }

  await runWithConcurrency(routes, ensureRoute, () => concurrency)

  // Newline after the inline progress indicator.
  process.stdout.write('\n')

  // Final persist — shutdown() ensures all turbo-tasks are fully written.
  Log.info('Persisting Turbopack cache to disk…')
  await persistCache(hotReloader, 'shutdown')
  Log.event('Cache persisted.')

  if (errors.length > 0) {
    Log.warn(
      `${errors.length} route(s) failed to compile (see errors above). ` +
        'The cache was still persisted for successfully compiled routes.'
    )
  } else {
    Log.event(`All ${total} routes prewarmed successfully.`)
  }
}

/**
 * Set up the Turbopack dev bundler without starting an HTTP server.  Returns
 * the Turbopack hot reloader cast to `TurbopackHotReloader` so that the
 * prewarm helpers (`getCurrentEntrypoints`, `awaitEntrypoints`) are visible.
 */
async function setupBundler(dir: string): Promise<TurbopackHotReloader> {
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

  if (!isFileSystemCacheEnabledForDev(config)) {
    Log.warn(
      'Turbopack persistent dev cache is not enabled for this project. ' +
        'Prewarming will still compile routes, but no on-disk cache will be ' +
        'written. Enable it with `experimental.turbopackFileSystemCacheForDev: true` ' +
        'in next.config.'
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
  })

  // The static type (`NextJsHotReloaderInterface`) is narrower than what
  // `createHotReloaderTurbopack` actually returns.  Since we forced
  // `turbo: true` above the cast is safe; we still verify defensively.
  const hotReloader = developmentBundler.hotReloader as TurbopackHotReloader
  if (typeof hotReloader.getCurrentEntrypoints !== 'function') {
    throw new Error(
      '`next internal prewarm-dev` requires Turbopack. ' +
        'Make sure the project is configured to use Turbopack (this is the default).'
    )
  }
  return hotReloader
}

/** Collect all app and pages router routes from the current entrypoints. */
function collectRoutes(hotReloader: TurbopackHotReloader): RouteEntry[] {
  const entrypoints = hotReloader.getCurrentEntrypoints()
  const routes: RouteEntry[] = []
  for (const [page] of entrypoints.app) routes.push({ page, isApp: true })
  for (const [page] of entrypoints.page) routes.push({ page, isApp: false })
  return routes
}

/**
 * Process `items` with an adaptive concurrency limit.  The current cap is
 * read from `getConcurrency()` on every scheduling pass so the caller can
 * grow the limit as work completes.
 */
async function runWithConcurrency<T>(
  items: ReadonlyArray<T>,
  worker: (item: T) => Promise<void>,
  getConcurrency: () => number
): Promise<void> {
  const queue = [...items]
  const active = new Set<Promise<void>>()

  while (queue.length > 0 || active.size > 0) {
    while (queue.length > 0 && active.size < getConcurrency()) {
      const item = queue.shift()!
      const p = worker(item).finally(() => {
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
 * - `mode: 'flush'`  – call `project.onExit()`, which runs the registered
 *   exit handlers (writing the DB to disk) without tearing down turbo-tasks.
 *   Used for intermediate batch persists during prewarm.
 * - `mode: 'shutdown'` – call `project.shutdown()`, which runs exit handlers
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
