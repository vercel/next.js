import type { NextConfigComplete } from '../config-shared'
import type {
  EncodedArgumentsForProbe,
  ProbeMessage,
  probeUseCache,
} from './use-cache-probe-worker'

import { Worker } from 'next/dist/compiled/jest-worker'
import { setUseCacheProbe } from '../use-cache/use-cache-probe-globals'
import { onCacheInvalidation } from './require-cache'
import { getFormattedNodeOptionsWithoutInspect } from '../lib/utils'
import { needsExperimentalReact } from '../../lib/needs-experimental-react'

interface InstallOptions {
  distDir: string
  buildId: string
  deploymentId: string
  nextConfig: NextConfigComplete
}

type ProbePool = { [key: string]: any } & {
  probeUseCache: typeof probeUseCache
}

/**
 * Convert the `encodedArguments` that `use-cache-wrapper.ts` already holds into
 * the worker-transport shape. Blob values are base64-encoded so the payload
 * survives the child-process JSON-only fallback transport — the worker_threads
 * path would handle Blobs via structured clone, but we need one shape that
 * works for both.
 */
async function toEncodedArgumentsForProbe(
  encoded: string | FormData
): Promise<EncodedArgumentsForProbe> {
  if (typeof encoded === 'string') {
    return { kind: 'string', data: encoded }
  }

  type FormDataEntries = Extract<
    EncodedArgumentsForProbe,
    { kind: 'formdata' }
  >['entries']
  const entries: FormDataEntries = []

  for (const [key, value] of encoded.entries()) {
    if (typeof value === 'string') {
      entries.push([key, value])
    } else {
      const bytes = Buffer.from(await value.arrayBuffer()).toString('base64')
      entries.push([key, { kind: 'blob', bytes, type: value.type }])
    }
  }

  return { kind: 'formdata', entries }
}

/**
 * Wire up the dev-server's `'use cache'` hang-detection probe: register the HMR
 * teardown listener and install the probe hook that `use-cache-wrapper` calls
 * when a fill stalls. Workers are spawned lazily — no process is forked until
 * the first probe actually fires.
 */
export function installUseCacheProbe(options: InstallOptions): void {
  const { distDir, buildId, deploymentId, nextConfig } = options

  // The deadlock pattern we're detecting requires the outer render's
  // dynamic-stage semantics to produce a halted promise that a user-space
  // `Map<string, Promise>` captures. A probe worker has no outer render, so its
  // cache-scope fetches resolve normally — the shared module scope can never
  // accumulate a halted promise that would poison a sibling probe. That's why
  // reusing workers across probes is safe: isolation between main and probe is
  // what matters, not between probe invocations.
  //
  // Torn down on HMR (stale user modules) and on worker crash. Hung probes
  // don't trigger teardown — the worker is still able to handle further tasks
  // (the hung promise just sits in its heap), and that leak is bounded by the
  // next HMR clear.
  let pool: ProbePool | undefined

  const getPool = (): ProbePool => {
    if (pool) {
      return pool
    }
    // Strip `--inspect` from any inherited `NODE_OPTIONS` so the worker doesn't
    // fight the parent for the same debug port.
    const probeNodeOptions = getFormattedNodeOptionsWithoutInspect()

    // The worker is shipped as four pre-bundled dev-only artifacts —
    // {webpack,turbopack} × {stable,experimental} — so the bundler aliases and
    // react-server layer resolve correctly at Next-build time. Pick the
    // matching artifact from runtime env. `needsExperimentalReact` is the same
    // predicate `define-env.ts` uses to wire `__NEXT_EXPERIMENTAL_REACT` for
    // the user's bundle, so the worker stays in lockstep.
    const turbo = process.env.TURBOPACK ? '-turbo' : ''
    const channel = needsExperimentalReact(nextConfig) ? '-experimental' : ''
    const workerPath = require.resolve(
      `next/dist/compiled/next-server/use-cache-probe-worker${turbo}${channel}.runtime.dev.js`
    )
    const worker = new Worker(workerPath, {
      maxRetries: 0,
      // jest-worker has no per-task scaling: once the pool is created, all
      // `numWorkers` workers are alive until pool teardown. Set to absorb
      // the realistic case of a single dev request fanning out into
      // multiple concurrent `'use cache'` invocations that each hit the
      // probe threshold.
      // TODO: replace with on-demand scaling once
      // https://github.com/vercel/next.js/pull/90532 lands — workers can
      // then spawn lazily and shrink back when idle.
      numWorkers: 4,
      enableWorkerThreads: nextConfig.experimental.workerThreads,
      // Listing the methods explicitly tells jest-worker to skip the discovery
      // `require()` it would otherwise do in the parent process. The bundle has
      // the full RSC pipeline embedded — loading it in the parent would eagerly
      // initialize bindings that should only run in the isolated worker.
      exposedMethods: ['probeUseCache'],
      forkOptions: {
        env: {
          ...process.env,
          NODE_OPTIONS: probeNodeOptions,
        },
      },
    }) as Worker & ProbePool
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
      // The worker process will exit on its own when nothing else holds it
      // open; a failed `.end()` here just means we couldn't wait cleanly.
    })
  }

  const runProbe = async (msg: ProbeMessage): Promise<boolean> => {
    let activePool: ProbePool
    try {
      activePool = getPool()
    } catch {
      return false
    }

    try {
      return await activePool.probeUseCache(msg)
    } catch {
      // Worker crash or IPC error: tear down the pool so the next probe starts
      // fresh.
      await tearDownPool()
      return false
    }
  }

  // The dev server can't reach into worker isolates to clear their
  // `require.cache` or `loadManifest` `sharedCache`, so we drop the whole pool
  // whenever the parent's caches are invalidated. The next probe lazy-spawns a
  // fresh worker with empty caches. No path-level bookkeeping — cache
  // invalidation in dev is infrequent and pool startup is cheap.
  onCacheInvalidation(() => {
    void tearDownPool()
  })

  // Wire the probe hook that `use-cache-wrapper` calls when a cache fill has
  // been idle long enough to suspect a hang. The forwarded request snapshot
  // lets the worker rebuild a faithful request store so cache bodies that read
  // cookies/headers/etc. behave as in a real fill.
  setUseCacheProbe(async (args) => {
    const encodedArguments = await toEncodedArgumentsForProbe(
      args.encodedArguments
    )
    return runProbe({
      distDir,
      page: args.page,
      route: args.route,
      id: args.id,
      kind: args.kind,
      encodedArguments,
      request: args.request,
      buildId,
      deploymentId,
      nextConfigSerializable: {
        httpAgentOptions: nextConfig.httpAgentOptions,
        cacheLifeProfiles: nextConfig.cacheLife,
        useCacheTimeout: nextConfig.experimental.useCacheTimeout,
        staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
      },
      timeoutMs: args.timeoutMs,
    })
  })
}
