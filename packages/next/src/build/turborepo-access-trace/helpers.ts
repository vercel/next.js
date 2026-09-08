import fs from 'fs/promises'
import path from 'path'
import type {
  FS,
  Addresses,
  EnvVars,
  RestoreOriginalFunction,
} from './types'
import { envProxy } from './env'
import { tcpProxy } from './tcp'
import { TurborepoAccessTraceResult } from './result'

/**
 * Trace access to the filesystem (TODO), environment variables, and TCP addresses and
 * merge the results into the parent `TurborepoAccessTraceResult`.
 *
 * @param f the function to trace
 * @param parent the `TurborepoAccessTraceResult` to merge the results into
 * @returns the result of the function
 */
export function turborepoTraceAccess<T>(
  f: () => T | Promise<T>,
  parent: TurborepoAccessTraceResult
): Promise<T> | T {
  // If the trace file is not set, don't trace and instead just call the
  // function.
  if (!process.env.TURBOREPO_TRACE_FILE) return f()

  // Otherwise, trace the function and merge the results into the parent. Using
  // `then` instead of `await` here to avoid creating a new async context when
  // tracing is disabled.
  return withTurborepoTraceAccess(f).then(([result, proxy]) => {
    parent.merge(proxy)

    // Return the result of the function.
    return result
  })
}

/**
 * Write the access trace to the trace file.
 *
 * @param distDir the directory to write the trace file to
 * @param traces an array of traces to merge and write to the trace file
 */
export async function writeTurborepoAccessTraceResult({
  distDir,
  traces,
}: {
  distDir: string
  traces: Array<TurborepoAccessTraceResult>
}) {
  const configTraceFile = process.env.TURBOREPO_TRACE_FILE

  if (!configTraceFile || traces.length === 0) return

  // merge traces
  const [accessTrace, ...otherTraces] = traces
  for (const trace of otherTraces) {
    accessTrace.merge(trace)
  }

  try {
    // make sure the directory exists
    await fs.mkdir(path.dirname(configTraceFile), { recursive: true })
    await fs.writeFile(
      configTraceFile,
      JSON.stringify({
        outputs: [`${distDir}/**`, `!${distDir}/cache/**`],
        accessed: accessTrace.toPublicTrace(),
      })
    )
  } catch (err) {
    // if we can't write this file, we should bail out here to avoid
    // the possibility of incorrect turborepo cache hits.
    throw new Error(`Failed to write turborepo access trace file`, {
      cause: err,
    })
  }
}

// Access is traced through process-global proxies (process.env and
// net.Socket.prototype.connect), so overlapping traces must share a single
// set of proxies. Installing and restoring them per invocation is racy:
// restores happen in completion order rather than LIFO, so an earlier
// restore removes a still-active trace's instrumentation (silently dropping
// its accesses) and a later restore reinstalls a stale proxy for the rest of
// the process lifetime. Since every consumer ultimately merges all traces
// into a single union (writeTurborepoAccessTraceResult), sharing one install
// between concurrent traces yields the same final result without the race.
let activeTraceCount = 0
let sharedEnvVars: EnvVars | null = null
let sharedAddresses: Addresses | null = null
let sharedFsPaths: FS | null = null
let restoreProxies: RestoreOriginalFunction[] = []

async function withTurborepoTraceAccess<T>(
  f: () => T | Promise<T>
): Promise<[T, TurborepoAccessTraceResult]> {
  if (activeTraceCount === 0) {
    // First trace installs the proxies; nested/concurrent traces share them.
    sharedEnvVars = new Set([])
    sharedAddresses = []
    sharedFsPaths = new Set<string>()
    restoreProxies = [tcpProxy(sharedAddresses), envProxy(sharedEnvVars)]
  }
  activeTraceCount++

  // Non-null by construction: a trace is active (count > 0) exactly while
  // the shared proxies are installed.
  const envVars = sharedEnvVars!
  const addresses = sharedAddresses!
  const fsPaths = sharedFsPaths!

  let functionResult

  // NOTE: we intentionally don't catch errors here so the calling function can handle them
  try {
    // call the wrapped function
    functionResult = await f()
  } finally {
    // The last concurrent trace to finish removes the proxies. The
    // count/check/restore sequence is synchronous, so it can't interleave
    // with another trace installing or restoring.
    activeTraceCount--
    if (activeTraceCount === 0) {
      const restore = restoreProxies
      restoreProxies = []
      sharedEnvVars = null
      sharedAddresses = null
      sharedFsPaths = null
      for (const r of restore) {
        r()
      }
    }
  }

  const traceResult = new TurborepoAccessTraceResult(
    envVars,
    addresses,
    fsPaths
  )

  return [functionResult, traceResult]
}
