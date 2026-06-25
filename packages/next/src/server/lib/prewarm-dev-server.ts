/**
 * Prewarm the Turbopack dev persistent cache by compiling every entrypoint.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * entrypoints (app + pages routes, pages globals when there are pages routes,
 * middleware, instrumentation), compiles each one in growing batches, flushes
 * the persistent cache to disk between batches, and finally shuts the project
 * down so the cache is fully written.
 */

// This must come first as it includes require hooks.
import '../node-environment'
import '../require-hook'

import os from 'os'

import type { Endpoint, Entrypoints } from '../../build/swc/types'
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
 * Size of the first compilation batch.  After each batch finishes the cache
 * is flushed to disk; the next batch is twice as big as the previous one.
 * So flushes happen after 10, 30, 70, 150, … units.
 */
const INITIAL_BATCH_SIZE = 10

/**
 * Multiplier applied to the batch size after each batch finishes.
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
  // prewarm leaves the cache in whatever state the most recent batch flush
  // reached, which is fine — the user just reruns.
  installHardExitSignalHandlers()

  Log.info('Starting Turbopack dev bundler for cache prewarming…')

  const hotReloader = await setupBundler(dir)
  const entrypoints = await hotReloader.getEntrypoints()

  // Middleware and instrumentation are eagerly compiled by `handleEntrypoints`
  // during `getEntrypoints()` above, so they're already part of the cache.
  // Track the count here so the final summary reflects everything that has
  // been seeded without triggering redundant `writeToDisk()` calls.
  let prewarmedDuringSetup = 0
  if (entrypoints.global.middleware) prewarmedDuringSetup++
  if (entrypoints.global.instrumentation) prewarmedDuringSetup += 2 // nodeJs + edge

  const units = collectUnits(entrypoints)
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

  async function compile(unit: PrewarmUnit): Promise<void> {
    try {
      await compileUnit(hotReloader, unit)
    } catch {
      // Per-unit errors are intentionally not logged: they would clutter
      // output and the count is reported in the final summary.
      failed++
    }
    completed++
    // Grow the concurrency cap one unit at a time so the very first
    // compiles are sequential.  Rationale: when the cache is cold the
    // first page tends to compile a lot of shared modules; doing it
    // solo lets every subsequent page (which is mostly already covered
    // by those shared turbo-tasks) finish quickly without N parallel
    // compiles racing each other for the same uncached work.  After a
    // few pages the shared graph is mostly cached and we can fan out
    // up to MAX_CONCURRENCY safely.
    if (concurrency < MAX_CONCURRENCY) concurrency++
  }

  // Hoisted out of the loop body for ESLint's `no-loop-func`: the closure
  // captures the mutable `concurrency` variable.
  const getConcurrency = () => concurrency

  // Process units in growing batches.  After each batch finishes (no
  // compilations in flight), flush the persistent cache to disk.  The very
  // last flush is performed by the `closeProject` call below, so we skip
  // the intermediate flush after the final batch.
  //
  // TODO(prewarm-dev): the batch size is currently unit-count based.  Some
  // routes are orders of magnitude more expensive than others, so a wall-
  // clock-based heuristic ("flush after N seconds of compilation") would
  // give a more consistent interval between flushes.  A memory-pressure
  // signal (to also trigger eviction between batches) is another option.
  let runError: unknown
  try {
    for (const batch of batchUnits(units)) {
      await runWithConcurrency(batch, compile, { getConcurrency })
      if (completed < total) {
        await flushPersistentCache(hotReloader)
        Log.info(
          `Persisted Turbopack cache (${completed} / ${total} entrypoints).`
        )
      }
    }
  } catch (err) {
    runError = err
  }

  // Always close the project so we persist whatever made it into the cache,
  // even when the run loop aborted (e.g. on a worker error).  Mirrors
  // `turbopack-build/impl.ts`.
  Log.info('Persisting Turbopack cache to disk…')
  try {
    await closeProject(hotReloader)
  } catch (closeErr) {
    if (runError === undefined) runError = closeErr
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
 * Yield successive batches of `units` with sizes
 * INITIAL_BATCH_SIZE, INITIAL_BATCH_SIZE * MULTIPLIER, … until exhausted.
 */
function* batchUnits(
  units: ReadonlyArray<PrewarmUnit>
): Iterable<PrewarmUnit[]> {
  let cursor = 0
  let batchSize = INITIAL_BATCH_SIZE
  while (cursor < units.length) {
    const end = Math.min(cursor + batchSize, units.length)
    yield units.slice(cursor, end)
    cursor = end
    batchSize *= BATCH_SIZE_MULTIPLIER
  }
}

/**
 * Set up the Turbopack dev bundler without starting an HTTP server.
 *
 * Errors out early when:
 *   - the user has chosen Rspack via `NEXT_RSPACK=1` (prewarm is
 *     Turbopack-only), or
 *   - the project doesn't enable the persistent dev cache (the whole point
 *     of prewarming).
 *
 * The underlying `bootstrapDevBundler` helper:
 *   - records a telemetry session labeled `cliCommand: 'prewarm-dev'`
 *   - acquires the dev lockfile (when `experimental.lockDistDir` is set)
 *     under the owner string `next prewarm-dev`, so an active `next dev`
 *     will refuse to start while a prewarm is running, and vice versa.
 */
async function setupBundler(dir: string): Promise<TurbopackHotReloader> {
  if (process.env.NEXT_RSPACK) {
    throw new Error(
      '`next internal prewarm-dev` requires Turbopack; Rspack is not supported.'
    )
  }

  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, dir)

  if (!isFileSystemCacheEnabledForDev(config)) {
    throw new Error(
      '`next internal prewarm-dev` requires the Turbopack persistent dev cache. ' +
        'Enable it with `experimental.turbopackFileSystemCacheForDev: true` in next.config.'
    )
  }

  const fsChecker = await setupFsCheck({
    dev: true,
    dir,
    config,
    minimalMode: false,
  })

  // The CLI sets `TURBOPACK=1` on the worker env; assert it here so a
  // direct (mis)invocation of this function fails loudly instead of
  // silently falling back to webpack via `bootstrapDevBundler`.
  if (!process.env.TURBOPACK) {
    throw new Error(
      'Assertion failed: prewarmDevServer must be invoked with TURBOPACK=1 in the env.'
    )
  }

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
  // `NextJsHotReloaderInterface`; runtime-check the prewarm helper before
  // narrowing the cast.
  const hotReloader = developmentBundler.hotReloader
  if (!('getEntrypoints' in hotReloader)) {
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
 * compiled by `handleEntrypoints` during `getEntrypoints()` and don't need
 * a second `writeToDisk()` call.
 */
function collectUnits(entrypoints: Entrypoints): PrewarmUnit[] {
  const units: PrewarmUnit[] = []

  // Only prewarm pages globals if the project actually has pages routes,
  // otherwise we'd compile unused default _app/_document/_error stubs in
  // app-only projects.
  const hasPagesRoutes = entrypoints.page.size > 0
  if (hasPagesRoutes) {
    if (entrypoints.global.app) {
      units.push({
        kind: 'pages-global',
        name: '/_app',
        endpoint: entrypoints.global.app,
      })
    }
    if (entrypoints.global.document) {
      units.push({
        kind: 'pages-global',
        name: '/_document',
        endpoint: entrypoints.global.document,
      })
    }
    if (entrypoints.global.error) {
      units.push({
        kind: 'pages-global',
        name: '/_error',
        endpoint: entrypoints.global.error,
      })
    }
  }

  for (const [page] of entrypoints.page) units.push({ kind: 'pages', page })
  for (const [page] of entrypoints.app) units.push({ kind: 'app', page })

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
 * Persist the Turbopack cache to disk while keeping the project alive.
 *
 * The JS `Project.runExitHandlers()` wrapper drives the same code path the
 * dev server uses on shutdown — writing the in-memory persistent cache to
 * disk — without tearing the project down, so it's safe to call repeatedly
 * during a single prewarm run.
 */
async function flushPersistentCache(
  hotReloader: TurbopackHotReloader
): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  await project.runExitHandlers()
}

/**
 * Tear down the Turbopack project and wait for the persistent cache to be
 * fully written.  Called once at the very end of prewarming; after this
 * the project is no longer usable.
 */
async function closeProject(hotReloader: TurbopackHotReloader): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  await project.shutdown()
}

/**
 * Install SIGINT/SIGTERM handlers that exit the worker immediately.  We do
 * not attempt to gracefully persist on signal — Ctrl+C should feel like
 * Ctrl+C — so the cache is left in whatever state the most recent flush
 * reached.
 *
 * Exit code follows the Unix convention of `128 + signal number` so callers
 * (and shells) can distinguish signal-terminated processes from regular
 * non-zero exits.
 */
function installHardExitSignalHandlers(): void {
  const onSignal = (signal: NodeJS.Signals) => {
    process.exit(128 + os.constants.signals[signal])
  }
  process.on('SIGINT', () => onSignal('SIGINT'))
  process.on('SIGTERM', () => onSignal('SIGTERM'))
}
