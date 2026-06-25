/**
 * Prewarm the Turbopack dev persistent cache by compiling every entrypoint.
 *
 * This module is invoked by the `next internal prewarm-dev` CLI command when
 * the child worker process detects `__NEXT_PRIVATE_PREWARM_DEV=1`.  It sets up
 * the Turbopack dev bundler (without starting an HTTP server), enumerates all
 * entrypoints (app + pages routes, pages globals when there are pages routes,
 * middleware, instrumentation), compiles each one with adaptive concurrency,
 * waits for Turbopack's idle-snapshot scheduler to flush the persistent
 * cache to disk, then runs the project's exit handlers and returns.
 */

// This must come first as it includes require hooks.
import '../node-environment'
import '../require-hook'

import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'

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

  let runError: unknown
  try {
    await runWithConcurrency(units, compile, { getConcurrency })
  } catch (err) {
    runError = err
  }

  // Wait for Turbopack's idle-snapshot scheduler to flush the persistent
  // cache to disk, then run on-exit handlers and exit.  See the comment on
  // `waitForCachePersisted` below for the full story on why we don't just
  // call `project.shutdown()`.
  Log.info('Persisting Turbopack cache to disk…')
  try {
    await waitForCachePersisted(dir)
    await runProjectExitHandlers(hotReloader)
  } catch (persistErr) {
    if (runError === undefined) runError = persistErr
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
 * Wait for Turbopack's idle-snapshot scheduler to flush the persistent
 * cache to disk by polling the cache directory until it has been stable
 * for a few consecutive readings.
 *
 * Why this is needed (and not just `project.shutdown()`):
 *
 *   The persistent cache is written exclusively by `backend.stop()` in
 *   `turbo-tasks-backend`, which is invoked from two places:
 *
 *   1. The idle-snapshot scheduler (`turbo-tasks-backend/.../backend/mod.rs`,
 *      look for `IDLE_TIMEOUT`) — runs while the project is alive, snapshots
 *      the cache when the system has been idle for `IDLE_TIMEOUT` (env-tunable
 *      via `TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS`, default 2s).
 *
 *   2. `project_shutdown` — calls `turbo_tasks().stop_and_wait()` which
 *      drains every foreground/background job and *then* invokes
 *      `backend.stop()`.  This is what `next build` uses, but it hangs
 *      forever in dev mode because the dev hot reloader's
 *      `entrypointsSubscribe` async loop keeps a foreground task alive for
 *      the lifetime of the project (see the doc comment on
 *      `project_shutdown` in `crates/next-napi-bindings/.../project.rs`:
 *      "skipped in the development server").
 *
 *   The prewarm worker uses the dev hot reloader (so we get `ensurePage`,
 *   `_app`/`_document`/`_error` handling, etc.), which means option 2 is
 *   off the table.  So we lean on option 1: after compilation the system
 *   goes idle, the scheduler kicks in after `IDLE_TIMEOUT`, and writes the
 *   cache to disk.  We poll the cache directory until the snapshot
 *   completes before exiting.
 */
async function waitForCachePersisted(projectDir: string): Promise<void> {
  // Same path Turbopack uses internally (`<distDir>/cache/turbopack` for
  // build, `<distDir>/dev/cache/turbopack` for dev — we always run with
  // `isDev=true` so we want the latter).  We compare against the parent
  // because Turbopack creates a versioned subdirectory inside.
  const cacheDir = path.join(projectDir, '.next', 'dev', 'cache', 'turbopack')

  const POLL_INTERVAL_MS = 500
  const STABLE_READINGS_REQUIRED = 3
  const MAX_WAIT_MS = 5 * 60 * 1000

  const idleTimeoutMs = parseInt(
    process.env.TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS ?? '',
    10
  )
  // Wait at least 2× the idle timeout before we start polling, so the
  // scheduler has had a fair chance to actually start writing.  Fall back
  // to the Rust default (2s) plus a buffer when unset.
  const initialDelayMs = Number.isFinite(idleTimeoutMs)
    ? Math.max(idleTimeoutMs * 2, 1000)
    : 4000

  await sleep(initialDelayMs)

  const startedAt = Date.now()
  let lastSize = await getDirSize(cacheDir)
  let stable = 0
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS)
    const size = await getDirSize(cacheDir)
    if (size > 0 && size === lastSize) {
      stable++
      if (stable >= STABLE_READINGS_REQUIRED) return
    } else {
      stable = 0
      lastSize = size
    }
  }
  Log.warn(
    `Cache size never stabilised after ${MAX_WAIT_MS / 1000}s; exiting anyway.`
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getDirSize(dir: string): Promise<number> {
  let total = 0
  try {
    const entries = await fs.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    })
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(entry.parentPath ?? entry.path, entry.name)
        try {
          const stat = await fs.stat(filePath)
          total += stat.size
        } catch {
          // File disappeared between readdir and stat — Turbopack may be
          // mid-write.  Ignore and let the next poll see it.
        }
      }
    }
  } catch {
    // Directory doesn't exist yet — cache is empty.
  }
  return total
}

/**
 * Run Turbopack's exit handlers.
 *
 * Wraps `Project.runExitHandlers()` (the napi `project_on_exit` binding).
 * In `next dev`, the only handlers registered today are trace/profiling
 * cleanup — the persistent cache is NOT written here (see the comment on
 * `waitForCachePersisted` for the full story).  We still run them for
 * symmetry with `next dev`'s cleanup path.
 *
 * Can only be called once per project: the underlying Rust receiver is
 * consumed on the first invocation.
 */
async function runProjectExitHandlers(
  hotReloader: TurbopackHotReloader
): Promise<void> {
  const project = hotReloader.turbopackProject
  if (!project) return
  await project.runExitHandlers()
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
