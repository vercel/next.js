import fs from 'fs/promises'
import path from 'path'
import type { FS, Addresses, EnvVars } from './types'
import { envProxy } from './env'
import { tcpProxy } from './tcp'
import { fsProxy } from './fs'
import { TurborepoAccessTraceResult } from './result'

/**
 * Trace access to the filesystem, environment variables, and TCP addresses and
 * merge the results into the parent AccessProxy.
 *
 * @param f the function to trace
 * @param parent the AccessProxy to merge the results into
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
  return withAccessProxy(f).then(([result, proxy]) => {
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

  if (configTraceFile && traces.length > 0) {
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
          access: accessTrace.toPublicTrace(),
        })
      )
    } catch (err) {
      // if we can't write this file, we should bail out here to avoid
      // the possibility of incorrect turborepo cache hits.
      throw new Error(`Failed to write turborepo access trace file`)
    }
  }
}

async function withAccessProxy<T>(
  f: () => T | Promise<T>
): Promise<[T, TurborepoAccessTraceResult]> {
  const envVars: EnvVars = new Set([])
  // addresses is an array of objects, so a set is useless
  const addresses: Addresses = []
  const fsPaths: FS = new Set<string>()

  // setup proxies
  const restoreTCP = tcpProxy(addresses)
  const restoreFS = fsProxy(fsPaths)
  const restoreEnv = envProxy(envVars)

  // call the wrapped function
  let functionResult
  try {
    functionResult = await f()
  } finally {
    // remove proxies
    restoreTCP()
    restoreFS()
    restoreEnv()
  }

  const traceResult = new TurborepoAccessTraceResult(
    envVars,
    addresses,
    fsPaths
  )

  return [functionResult, traceResult]
}
