import type { NextConfigComplete } from '../server/config-shared'
import type { Telemetry } from '../telemetry/storage'
import type { Span } from '../trace'

import * as Log from './output/log'
import { Worker } from '../lib/worker'
import createSpinner from './spinner'
import { eventTypeCheckCompleted } from '../telemetry/events'
import isError from '../lib/is-error'
import { hrtimeDurationToString } from './duration-to-string'

/**
 * TypeScript setup and type checking run in a worker so the compiler's memory
 * can be released before the rest of the build continues.
 *
 * Since it is impossible to pass a function from main thread to a worker,
 * instead of running "next/lib/typescript/runTypeCheck" in a worker,
 * we will run entire "next/lib/verify-typescript-setup" in a worker instead.
 */
function verifyAndRunTypeScript(
  dir: string,
  distDir: string,
  strictRouteTypes: boolean,
  shouldRunTypeCheck: boolean,
  tsconfigPath: string | undefined,
  typedRoutes: boolean,
  disableStaticImages: boolean,
  cacheDir: string | undefined,
  enableWorkerThreads: boolean | undefined,
  hasAppDir: boolean,
  hasPagesDir: boolean,
  appDir: string | undefined,
  pagesDir: string | undefined,
  debugBuildPaths: { app: string[]; pages: string[] } | undefined,
  useTypeScriptCli: boolean
) {
  let impl: typeof import('../lib/verify-typescript-setup').verifyAndRunTypeScript
  let typeCheckWorker:
    | (Worker & {
        verifyAndRunTypeScript: typeof impl
      })
    | undefined
  if (shouldRunTypeCheck) {
    typeCheckWorker = new Worker(
      require.resolve('../lib/verify-typescript-setup'),
      {
        exposedMethods: ['verifyAndRunTypeScript'],
        debuggerPortOffset: -1,
        isolatedMemory: false,
        numWorkers: 1,
        // CLI mode must use a child-process worker so terminating the worker
        // produces a process lifecycle event that can be forwarded to `tsc`.
        enableWorkerThreads: useTypeScriptCli ? false : enableWorkerThreads,
        maxRetries: 0,
      }
    ) as typeof typeCheckWorker
    impl = typeCheckWorker!.verifyAndRunTypeScript
  } else {
    // When not running typecheck, just run the implementation in-process without spawning a worker,
    // to avoid the overhead of the worker.
    impl = (
      require('../lib/verify-typescript-setup') as typeof import('../lib/verify-typescript-setup')
    ).verifyAndRunTypeScript
  }

  return impl({
    dir,
    distDir,
    strictRouteTypes,
    shouldRunTypeCheck,
    tsconfigPath,
    typedRoutes,
    disableStaticImages,
    cacheDir,
    hasAppDir,
    hasPagesDir,
    appDir,
    pagesDir,
    debugBuildPaths,
    useTypeScriptCli,
  })
    .then((result) => {
      typeCheckWorker?.end()
      return result
    })
    .catch(() => {
      // The error is already logged in the worker, we simply exit the main thread to prevent the
      // `Jest worker encountered 1 child process exceptions, exceeding retry limit` from showing up
      process.exit(1)
    })
}

export async function startTypeChecking({
  cacheDir,
  config,
  dir,
  nextBuildSpan,
  pagesDir,
  telemetry,
  appDir,
  debugBuildPaths,
}: {
  cacheDir: string
  config: NextConfigComplete
  dir: string
  nextBuildSpan: Span
  pagesDir?: string
  telemetry: Telemetry
  appDir?: string
  debugBuildPaths: { app: string[]; pages: string[] } | undefined
}) {
  const ignoreTypeScriptErrors = Boolean(config.typescript.ignoreBuildErrors)
  const useTypeScriptCli = Boolean(config.experimental.useTypeScriptCli)

  if (ignoreTypeScriptErrors) {
    Log.info('Skipping validation of types')
  }

  let typeCheckingSpinnerPrefixText: string | undefined
  let typeCheckingSpinner: ReturnType<typeof createSpinner> | undefined

  if (!ignoreTypeScriptErrors) {
    typeCheckingSpinnerPrefixText = 'Running TypeScript'
  }

  if (typeCheckingSpinnerPrefixText) {
    if (useTypeScriptCli) {
      // The CLI writes directly to stdout/stderr, bypassing the console hooks
      // that pause an active spinner. Keep its diagnostics byte-for-byte and
      // on their own lines by logging a static status line instead.
      Log.info(`${typeCheckingSpinnerPrefixText} ...`)
    } else {
      typeCheckingSpinner = createSpinner(typeCheckingSpinnerPrefixText)
    }
  }

  const typeCheckAndLintStart = process.hrtime()

  try {
    const [verifyResult, typeCheckEnd] = await nextBuildSpan
      .traceChild('run-typescript')
      .traceAsyncFn(() =>
        verifyAndRunTypeScript(
          dir,
          config.distDir,
          Boolean(config.experimental.strictRouteTypes),
          !ignoreTypeScriptErrors,
          config.typescript.tsconfigPath,
          Boolean(config.typedRoutes),
          config.images.disableStaticImages,
          cacheDir,
          config.experimental.workerThreads,
          !!appDir,
          !!pagesDir,
          appDir,
          pagesDir,
          debugBuildPaths,
          useTypeScriptCli
        ).then((resolved) => {
          const checkEnd = process.hrtime(typeCheckAndLintStart)
          return [resolved, checkEnd] as const
        })
      )

    if (typeCheckingSpinner) {
      typeCheckingSpinner.stop()
    }

    createSpinner(
      `Finished TypeScript${ignoreTypeScriptErrors ? ' config validation' : ''} in ${hrtimeDurationToString(typeCheckEnd)}`
    )?.stopAndPersist()

    if (!ignoreTypeScriptErrors && verifyResult) {
      telemetry.record(
        eventTypeCheckCompleted({
          durationInSeconds: typeCheckEnd[0],
          typescriptVersion: verifyResult.version,
          inputFilesCount: verifyResult.result?.inputFilesCount,
          totalFilesCount: verifyResult.result?.totalFilesCount,
          incremental: verifyResult.result?.incremental,
          typeCheckMode: verifyResult.typeCheckMode,
        })
      )
    }
  } catch (err) {
    // prevent showing jest-worker internal error as it
    // isn't helpful for users and clutters output
    if (isError(err) && err.message === 'Call retries were exceeded') {
      await telemetry.flush()
      process.exit(1)
    }
    throw err
  }
}
