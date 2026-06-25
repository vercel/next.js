/**
 * Prewarm the Turbopack dev persistent cache by compiling every entrypoint.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * entrypoints (app + pages routes, pages globals when there are pages routes,
 * middleware, instrumentation), then drains them in batches: each batch is
 * compiled with adaptive concurrency, then we wait for the in-flight
 * compilations to finish (no new tasks scheduled in the meantime), persist
 * the cache, and start the next batch.
 *
 * The batch boundaries are time-based — the persist schedule is described
 * inline in `prewarmDevServer` below.  We run the persistent backend in
 * `StorageMode::ReadWriteOnShutdown` (via `isShortSession: true`) so the
 * idle-snapshot scheduler is disabled and persistence is driven entirely
 * from JS via `Project.persistCache()`.
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
 * Delay before the first persist.  Subsequent persist intervals grow over
 * time — see `nextPersistAt` below.
 */
const FIRST_PERSIST_DELAY_MS = 10_000

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
 * entrypoints discovered, persist failure, etc.) so the parent process
 * can surface them.
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

  // ----- Time-driven persist schedule -----
  // We persist when wall-clock time crosses a moving target.  The target
  // starts at `startTime + FIRST_PERSIST_DELAY_MS`; after each persist
  // finishes the next target is set to
  //   nextPersist = 2 * lastPersistFinishedAt - startTime
  // which is equivalent to doubling the elapsed time from start to the
  // last persist.  This way later batches (which are usually cheaper —
  // most shared chunks are cached after the first persist) accumulate
  // more work between persists, while the first batch persists quickly so
  // users see partial cache state if they abort early.
  const startTime = Date.now()
  let nextPersistAt = startTime + FIRST_PERSIST_DELAY_MS

  // Split units into time-bounded batches and process each batch with
  // `runWithConcurrency`.  When the deadline for the next persist passes
  // mid-batch, we let the current batch finish (so persisting sees a
  // quiescent system), persist, then schedule the next deadline before
  // starting the next batch.
  let cursor = 0
  while (cursor < units.length) {
    // Slice the next batch: include units until we've crossed the next
    // persist deadline, or we run out of units.
    const batchStart = cursor
    while (cursor < units.length && Date.now() < nextPersistAt) {
      cursor++
    }
    // Always pull at least one unit per batch — guards against pathological
    // schedules (e.g. a clock skew) producing empty batches.
    if (cursor === batchStart) cursor++
    const batch = units.slice(batchStart, cursor)

    // `runWithConcurrency` doesn't return until every promise in this
    // batch has settled, so once it resolves there's no compilation in
    // flight — safe to persist.
    await runWithConcurrency(batch, compile, { getConcurrency })

    if (cursor < units.length) {
      // More work to do — persist, then update the deadline.  We do NOT
      // persist after the very last batch: `prewarmDevServer` always
      // performs a final persist below to flush the trailing work.
      await persistCache(hotReloader)
      nextPersistAt = 2 * Date.now() - startTime
    }
  }

  // Final persist: flush whatever the last batch produced.  This is the
  // call that guarantees the on-disk cache reflects every unit we
  // compiled, even when no time-driven persist fired in the loop above
  // (e.g. for tiny projects that finish before the first deadline).
  Log.info('Persisting Turbopack cache to disk…')
  await persistCache(hotReloader)

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
    // Disable the idle-snapshot scheduler.  Prewarm drives persistence
    // explicitly via `Project.persistCache()` on a time-based schedule
    // — see the persist loop in `prewarmDevServer` for the details.
    isShortSession: true,
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
 * Trigger a snapshot+persist cycle on the underlying Turbopack project.
 *
 * Wraps `Project.persistCache()` (the napi `project_persist_cache`
 * binding), which synchronously drives `backend.snapshot_and_persist`
 * regardless of idle state.  The project remains usable afterwards and
 * the call may be repeated.
 *
 * The caller is responsible for ensuring no compilation is in flight
 * before invoking this — the snapshot suspends concurrent operations
 * via the snapshot coordinator, so calling it mid-batch is incorrect.
 *
 * We're free to call this (instead of relying on the background
 * scheduler) because the prewarm bundler is configured with
 * `isShortSession: true`, which puts the backend in
 * `StorageMode::ReadWriteOnShutdown` and disables the idle scheduler.
 */
async function persistCache(hotReloader: TurbopackHotReloader): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  await project.persistCache()
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
