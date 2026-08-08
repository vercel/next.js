import type { NextConfigComplete } from '../config-shared'
import type { runDevValidation } from './dev-validation-worker'
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
  // tail.
  let pool: ValidationPool | undefined

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
      exposedMethods: ['runDevValidation'],
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

  // The dev server can't reach into the worker to clear its `require.cache` or
  // manifest caches, so we drop the worker whenever the parent's caches are
  // invalidated (HMR, route recompile). The next validation lazy-spawns a fresh
  // worker with empty caches.
  onCacheInvalidation(() => {
    void tearDownPool()
  })

  setDevValidationWorker(runValidation)
}
