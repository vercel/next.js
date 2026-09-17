import type { NextConfigComplete } from '../config-shared'
import type { NodeJsPartialHmrUpdate } from '../../build/swc/types'
import type {
  applyHmrUpdate,
  invalidateCaches,
  runDevValidation,
} from './dev-validation-worker'
import type {
  DevValidationSnapshot,
  DevValidationWorkerMessage,
  DevValidationWorkerResult,
} from '../app-render/dev-validation-worker-globals'

import { Worker } from 'next/dist/compiled/jest-worker'
import { setDevValidationWorker } from '../app-render/dev-validation-worker-globals'
import { onCacheInvalidation } from './require-cache'
import { getFormattedNodeOptionsWithoutInspect } from '../lib/utils'
import { needsExperimentalReact } from '../../lib/needs-experimental-react'

interface InstallOptions {
  distDir: string
  buildId: string
  deploymentId: string
  nextConfig: NextConfigComplete
}

type ValidationPool = { [key: string]: any } & {
  runDevValidation: typeof runDevValidation
  applyHmrUpdate: typeof applyHmrUpdate
  invalidateCaches: typeof invalidateCaches
}

/**
 * One change the dev server made to its own module state — the modules it has
 * loaded, and the manifest caches that describe them.
 *
 * The worker holds the same state, seeded from the same build output, and
 * replays every change the dev server reports, so its state is the dev server's
 * state by construction.
 */
type DevModuleStateChange =
  | { type: 'apply'; update: NodeJsPartialHmrUpdate }
  | { type: 'invalidate'; filePaths: string[]; evictModules: boolean }

/**
 * Replays a change the dev server made to its own module state in the
 * validation worker. Installed alongside the worker, so it is absent when no
 * worker runs (`experimental.devValidationWorker: false`, or Webpack).
 */
let mirrorModuleState: ((change: DevModuleStateChange) => void) | undefined

/**
 * Drops the validation worker. Called when the dev server cannot repair its own
 * module state in place and re-evaluates every module from disk, which the
 * worker matches by starting over: the next validation spawns a worker that
 * loads the current build output.
 *
 * A worker dropped on its own, by a failed replay or a crash, is the one case
 * where the two can diverge. The dev server keeps the modules it evaluated from
 * earlier updates, and a worker spawned afterwards has no way to obtain those
 * scripts, so frames naming them stay unresolved until those modules change
 * again. The validation itself is unaffected, because the worker loads the
 * current code from disk.
 */
let dropWorker: (() => void) | undefined

export function mirrorModuleStateToDevValidationWorker(
  change: DevModuleStateChange
): void {
  mirrorModuleState?.(change)
}

export function dropDevValidationWorker(): void {
  dropWorker?.()
}

/**
 * Wire up the dev-server's validation worker: register the HMR teardown
 * listener and install the hook that `runDevValidationInBackground` calls once
 * a render has settled. The worker thread is spawned lazily, so nothing is
 * created until the first navigation actually validates.
 */
export function installDevValidationWorker(options: InstallOptions): void {
  const { distDir, buildId, deploymentId, nextConfig } = options

  // A single worker, not a pool. Validation for one navigation runs its depth
  // loop sequentially, and a newer navigation supersedes the previous one
  // (aborting it mid-run) rather than running concurrently, so there's no
  // per-request fan-out to parallelize (unlike the `'use cache'` probe, where
  // one request fans out into concurrent probes). One worker already frees the
  // main thread, which is the whole point; it also keeps each request's CLI
  // marker block contiguous in the piped output. Torn down on HMR (stale user
  // modules) and on crash.
  //
  // TODO(dev-validation-worker): raise `numWorkers` if concurrent navigations
  // across independent requests (e.g. multiple tabs) show a validation-latency
  // tail. Raising it means `mirrorChange` has to reach every worker instead of
  // whichever one the pool hands the call to, and the ordering it relies on
  // holds per worker rather than across them.
  let pool: ValidationPool | undefined

  const mirrorChange = (change: DevModuleStateChange): void => {
    const current = pool
    if (!current) {
      // No worker to keep current, and nothing to replay into a later one: the
      // compilation that produced this change also wrote the updated chunk to
      // disk, so a worker spawning after it reads the current code through
      // `loadComponents`. Evaluating the update is what an isolate that is
      // already running needs, not what a new one does.
      return
    }

    // The worker runs one call at a time, in the order the calls were made
    // (see `numWorkers` below), so this is replayed before any validation
    // requested after it, and never in the middle of one. That ordering is by
    // call time, which is why the call is made here, as the change arrives,
    // rather than deferred onto a queue of our own. A validation already
    // queued runs first, which is what its render needs: it was produced
    // before this change. The dev server does not hold its own updates back
    // for a validation running in process either.
    const replayed =
      change.type === 'invalidate'
        ? current.invalidateCaches(change.filePaths, change.evictModules)
        : current.applyHmrUpdate(change.update).then(async (outcome) => {
            if (outcome === 'failed') {
              await tearDownPool()
            }
          })

    void replayed.catch(async () => {
      // A replay that failed leaves the worker's state unknown, so it is
      // dropped rather than trusted.
      await tearDownPool()
    })
  }

  const getPool = (): ValidationPool => {
    if (pool) {
      return pool
    }
    // Strip `--inspect` from any inherited `NODE_OPTIONS` so the worker doesn't
    // fight the parent for the same debug port.
    const workerNodeOptions = getFormattedNodeOptionsWithoutInspect()

    // The worker is shipped as four pre-bundled dev-only artifacts
    // ({webpack,turbopack} × {stable,experimental}), one per combination of the
    // user's bundler and vendored React channel. Pick the matching artifact
    // from runtime env so the worker stays in lockstep with the user's app
    // bundle. `needsExperimentalReact` is the same predicate `define-env.ts`
    // uses to wire `__NEXT_EXPERIMENTAL_REACT`.
    const turbo = process.env.TURBOPACK ? '-turbo' : ''
    const channel = needsExperimentalReact(nextConfig) ? '-experimental' : ''
    const workerPath = require.resolve(
      `next/dist/compiled/next-server/dev-validation-worker${turbo}${channel}.runtime.dev.js`
    )

    const worker = new Worker(workerPath, {
      maxRetries: 0,
      numWorkers: 1,
      // Always worker-threads, regardless of `experimental.workerThreads`.
      // Unlike the `'use cache'` probe (which follows the flag), validation has
      // no reason to prefer a child process: it doesn't need process-level
      // isolation (a worker thread already has its own V8 heap and module
      // registry, so the reloaded route is isolated from the main thread), and
      // threads let a superseded validation be aborted mid-run through a shared
      // `SharedArrayBuffer`, which a separate process can't receive. Threads
      // also carry the transported Flight bytes as typed arrays via structured
      // clone, with no JSON round-trip to corrupt them.
      enableWorkerThreads: true,
      // Listing the method explicitly tells jest-worker to skip the discovery
      // `require()` it would otherwise do in the parent process to enumerate
      // the module's exports. This worker's top-level imports (`require-hook`,
      // `node-environment`) run runtime setup meant only for the isolated
      // worker thread, so they must not be evaluated in the parent.
      exposedMethods: [
        'runDevValidation',
        'applyHmrUpdate',
        'invalidateCaches',
      ],
      forkOptions: {
        env: {
          ...process.env,
          NODE_OPTIONS: workerNodeOptions,
        },
      },
    }) as Worker & ValidationPool
    worker.getStdout().pipe(process.stdout)
    worker.getStderr().pipe(process.stderr)
    pool = worker
    return worker
  }

  const tearDownPool = async (): Promise<void> => {
    const current = pool
    if (!current) {
      return
    }
    pool = undefined
    await current.end().catch(() => {
      // The worker thread exits on its own once its work settles; a failed
      // `.end()` here just means we couldn't wait for it cleanly.
    })
  }

  const runValidation = async (
    snapshot: DevValidationSnapshot,
    validationAbortSignal: AbortSignal
  ): Promise<DevValidationWorkerResult> => {
    let activePool: ValidationPool
    try {
      activePool = getPool()
    } catch {
      return null
    }

    const message: DevValidationWorkerMessage = {
      ...snapshot,
      distDir,
      buildId,
      deploymentId,
      nextConfigSerializable: {
        httpAgentOptions: nextConfig.httpAgentOptions,
        cacheLifeProfiles: nextConfig.cacheLife,
        useCacheTimeout: nextConfig.experimental.useCacheTimeout,
        durableUseCacheEntries: Boolean(
          nextConfig.experimental.durableUseCacheEntries
        ),
        staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
      },
    }

    // The worker runs as a thread (see `enableWorkerThreads` above), so an
    // abort reaches it through a one-slot shared flag rather than the abort
    // signal directly (a signal can't cross the thread boundary). Mirror an
    // abort of `validationAbortSignal` into the buffer and wake the worker's
    // `Atomics.waitAsync` on it, so it aborts the in-flight run at its next
    // depth boundary.
    const abortBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const abortFlag = new Int32Array(abortBuffer)
    const propagateAbort = () => {
      Atomics.store(abortFlag, 0, 1)
      Atomics.notify(abortFlag, 0)
    }
    if (validationAbortSignal.aborted) {
      propagateAbort()
    } else {
      validationAbortSignal.addEventListener('abort', propagateAbort, {
        once: true,
      })
    }

    try {
      return await activePool.runDevValidation(message, abortBuffer)
    } catch {
      // Worker crash or IPC error: tear down so the next validation starts
      // fresh. The main thread treats a missing result as "nothing to deliver."
      await tearDownPool()
      return null
    } finally {
      // `once` only auto-removes the listener if it fired, so remove it
      // explicitly to bound its lifetime to this run when validation completed
      // without being superseded.
      validationAbortSignal.removeEventListener('abort', propagateAbort)
    }
  }

  // The dev server just cleared these paths from its own `require.cache` and
  // manifest caches. The worker clears them from its copies.
  onCacheInvalidation((filePaths) => {
    mirrorChange({
      type: 'invalidate',
      filePaths,
      evictModules: true,
    })
  })

  mirrorModuleState = mirrorChange
  dropWorker = () => {
    void tearDownPool()
  }

  setDevValidationWorker(runValidation)
}
