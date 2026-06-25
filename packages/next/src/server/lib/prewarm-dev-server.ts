/**
 * Prewarm the Turbopack dev persistent cache by compiling every route.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * routes, calls `ensurePage` for each one, and then shuts down Turbopack so
 * that the persistent cache is flushed to disk.
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
import type { NextJsHotReloaderInterface } from '../dev/hot-reloader-types'
import type { TurbopackHotReloader } from '../dev/hot-reloader-turbopack'

/** Subset of TurbopackHotReloader used during prewarm. */
type PrewarmHotReloader = NextJsHotReloaderInterface & {
  getCurrentEntrypoints: TurbopackHotReloader['getCurrentEntrypoints']
  awaitEntrypoints: TurbopackHotReloader['awaitEntrypoints']
}
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
 * Number of routes compiled before the Turbopack cache is flushed to disk
 * for the first time (via `project.onExit()`).  Subsequent batch sizes double
 * on each flush, so batches are: 10, 20, 40, 80, …
 */
const INITIAL_BATCH_SIZE = 10

/**
 * The batch size is multiplied by this factor after every intermediate flush.
 * E.g. 10 → 20 → 40 → …
 */
const BATCH_SIZE_MULTIPLIER = 2

// ---------------------------------------------------------------------------

export async function prewarmDevServer(opts: { dir: string }): Promise<void> {
  const { dir } = opts

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = 'development'
  }

  Log.info('Starting Turbopack dev bundler for cache prewarming…')

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

  let originalFetch = globalThis.fetch
  const resetFetch = () => {
    globalThis.fetch = originalFetch
    ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false
  }

  // We need a minimal LazyRenderServerInstance — prewarm only compiles,
  // it never renders pages.
  const renderServer: import('./router-server').LazyRenderServerInstance = {}

  const { setupDevBundler } =
    require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

  const developmentBundler = await setupDevBundler({
    renderServer,
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

  // The hotReloader returned by Turbopack is extended with prewarm helpers.
  // We cast here since the static type (NextJsHotReloaderInterface) is narrower
  // than what createHotReloaderTurbopack actually returns.
  const hotReloader = developmentBundler.hotReloader as PrewarmHotReloader

  if (
    typeof hotReloader.getCurrentEntrypoints !== 'function' ||
    typeof hotReloader.awaitEntrypoints !== 'function'
  ) {
    throw new Error(
      '`next internal prewarm-dev` requires Turbopack. ' +
        'Make sure the project is configured to use Turbopack (this is the default).'
    )
  }

  // Wait for the initial entrypoints to be populated.
  await hotReloader.awaitEntrypoints()

  const entrypoints = hotReloader.getCurrentEntrypoints()

  type RouteEntry =
    | { page: string; isApp: true }
    | { page: string; isApp: false }

  const routes: RouteEntry[] = []

  for (const [page] of entrypoints.app) {
    routes.push({ page, isApp: true })
  }
  for (const [page] of entrypoints.page) {
    routes.push({ page, isApp: false })
  }

  const total = routes.length

  if (total === 0) {
    Log.info('No routes found — nothing to prewarm.')
    await shutdownProject(hotReloader)
    return
  }

  Log.info(`Prewarming ${total} routes…`)

  const errors: Array<{ page: string; err: unknown }> = []
  let completed = 0
  let concurrency = INITIAL_CONCURRENCY
  let batchSize = INITIAL_BATCH_SIZE
  // Track the number of routes completed at the last persist.
  let lastPersistAt = 0

  function ensureRoute(entry: RouteEntry): Promise<void> {
    return hotReloader
      .ensurePage({
        page: entry.page,
        clientOnly: false,
        isApp: entry.isApp,
        definition: undefined,
      })
      .then(
        () => {
          Log.event(`  ✓  ${entry.page}  (${entry.isApp ? 'app' : 'pages'})`)
        },
        (routeErr: unknown) => {
          Log.error(
            `  ✗  ${entry.page}  (${
              entry.isApp ? 'app' : 'pages'
            }): ${routeErr instanceof Error ? routeErr.message : String(routeErr)}`
          )
          errors.push({ page: entry.page, err: routeErr })
        }
      )
      .then(() => {
        completed++
        // Grow concurrency after each completed route, up to the maximum.
        if (concurrency < MAX_CONCURRENCY) concurrency++
        process.stdout.write(`\r  [${completed} / ${total} routes compiled]`)

        // Flush to disk after every batch using onExit() which persists
        // without tearing down the Turbopack project.
        if (completed - lastPersistAt >= batchSize) {
          lastPersistAt = completed
          batchSize = Math.min(
            batchSize * BATCH_SIZE_MULTIPLIER,
            // Don't let batch size exceed total routes.
            total
          )
          flushCache(hotReloader).catch(console.error)
        }
      })
  }

  const queue = [...routes]
  const active = new Set<Promise<void>>()

  async function drain(): Promise<void> {
    while (queue.length > 0 || active.size > 0) {
      // Fill up to current concurrency.
      while (queue.length > 0 && active.size < concurrency) {
        const entry = queue.shift()!
        const p = ensureRoute(entry).finally(() => {
          active.delete(p)
        })
        active.add(p)
      }

      if (active.size > 0) {
        await Promise.race(active)
      }
    }
  }

  await drain()

  // Newline after the progress indicator.
  process.stdout.write('\n')

  // Final persist — shutdown() ensures all turbo-tasks are fully written.
  Log.info('Persisting Turbopack cache to disk…')
  await shutdownProject(hotReloader)
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
 * Flush the Turbopack persistent cache to disk without tearing down the
 * project.  Used for intermediate batch persists during prewarm.
 */
async function flushCache(hotReloader: PrewarmHotReloader): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  // `onExit()` runs the registered exit handlers (which write the DB to disk)
  // without shutting down turbo-tasks — safe to call multiple times.
  await project.onExit()
}

/**
 * Fully shut down the Turbopack project and persist everything to disk.
 * Called once at the very end of prewarming.
 */
async function shutdownProject(hotReloader: PrewarmHotReloader): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  // `shutdown()` runs exit handlers AND waits for turbo-tasks to fully persist.
  await project.shutdown()
}
