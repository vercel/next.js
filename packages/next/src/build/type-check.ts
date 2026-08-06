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
  useTypeScriptCli: boolean,
  typeCheckPreflightDone: boolean,
  deferExitOnError: boolean,
  onFirstCliOutput?: () => void
) {
  let impl: typeof import('../lib/verify-typescript-setup').verifyAndRunTypeScript
  let typeCheckWorker:
    | (Worker & {
        verifyAndRunTypeScriptInWorker: typeof impl
      })
    | undefined
  if (shouldRunTypeCheck && !useTypeScriptCli) {
    typeCheckWorker = new Worker(
      require.resolve('../lib/verify-typescript-setup'),
      {
        exposedMethods: ['verifyAndRunTypeScriptInWorker'],
        debuggerPortOffset: -1,
        isolatedMemory: false,
        numWorkers: 1,
        enableWorkerThreads,
        maxRetries: 0,
        // Concurrent builds need the rejection so they can finish compiler
        // shutdown and surface a checker-specific diagnostic.
        exitOnWorkerExit: !deferExitOnError,
      }
    ) as typeof typeCheckWorker
    impl = typeCheckWorker!.verifyAndRunTypeScriptInWorker
  } else {
    // No worker: either we are not type-checking (just writing setup files), or
    // the CLI checker runs `tsc` in-process. Avoid the worker overhead.
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
    typeCheckPreflightDone,
    deferExitOnError,
    onFirstCliOutput,
  })
    .then((result) => {
      typeCheckWorker?.end()
      return result
    })
    .catch((error) => {
      typeCheckWorker?.end()
      // The error is already logged in the worker for the API checker, or
      // directly for the in-process CLI checker. Sequential builds exit here
      // to avoid surfacing jest-worker's internal retry message. Concurrent
      // builds propagate the rejection so the caller can wait for compilation
      // and Turbopack shutdown before exiting.
      if (deferExitOnError) {
        throw error
      }
      process.exit(1)
    })
}

export function isTypeCheckError(error: unknown): error is Error {
  return isError(error) && error.name === 'NextTypeCheckError'
}

type TypeCheckingOptions = {
  cacheDir: string
  config: NextConfigComplete
  dir: string
  nextBuildSpan: Span
  pagesDir?: string
  telemetry: Telemetry
  appDir?: string
  debugBuildPaths: { app: string[]; pages: string[] } | undefined
  typeCheckPreflightDone?: boolean
  deferExitOnError?: boolean
  showTypeCheckingSpinner?: boolean
}

/**
 * Finish TypeScript's project setup before compilation starts. The actual type
 * check can then run concurrently without racing writes to tsconfig.json or
 * next-env.d.ts against the compiler reading those files. Returns false when
 * the project does not need the standard TypeScript checker.
 */
export async function prepareTypeChecking({
  cacheDir,
  config,
  dir,
  pagesDir,
  appDir,
  debugBuildPaths,
  telemetry,
}: TypeCheckingOptions) {
  const useTypeScriptCli = Boolean(config.experimental.useTypeScriptCli)
  const preflightStart = process.hrtime()
  const { verifyAndRunTypeScript: verifyTypeScriptSetup } =
    require('../lib/verify-typescript-setup') as typeof import('../lib/verify-typescript-setup')

  try {
    const result = await verifyTypeScriptSetup({
      dir,
      distDir: config.distDir,
      strictRouteTypes: Boolean(config.experimental.strictRouteTypes),
      shouldRunTypeCheck: false,
      tsconfigPath: config.typescript.tsconfigPath,
      typedRoutes: Boolean(config.typedRoutes),
      disableStaticImages: config.images.disableStaticImages,
      cacheDir,
      hasAppDir: !!appDir,
      hasPagesDir: !!pagesDir,
      appDir,
      pagesDir,
      debugBuildPaths,
      useTypeScriptCli,
    })
    if (result.version === null) {
      const preflightEnd = process.hrtime(preflightStart)
      // Preserve the event emitted by the old sequential path even though
      // JavaScript-only/native-preview projects can now skip its empty phase.
      telemetry.record(
        eventTypeCheckCompleted({
          durationInSeconds: preflightEnd[0],
          typescriptVersion: null,
          typeCheckMode: result.typeCheckMode,
        })
      )
      return false
    }
    return true
  } catch {
    // The setup helper already printed its user-facing error. Match the worker
    // path by avoiding a second copy and an internal stack from the build CLI.
    await telemetry.flush()
    process.exit(1)
  }
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
  typeCheckPreflightDone = false,
  deferExitOnError = false,
  showTypeCheckingSpinner = true,
}: TypeCheckingOptions) {
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
    if (showTypeCheckingSpinner) {
      typeCheckingSpinner = createSpinner(typeCheckingSpinnerPrefixText)
    } else {
      // Turbopack's build worker writes directly to stdout/stderr, bypassing
      // spinner interception. Use a stable line while both workers are active.
      Log.info(typeCheckingSpinnerPrefixText)
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
          useTypeScriptCli,
          typeCheckPreflightDone,
          deferExitOnError,
          // Stop the spinner before as soon as the subprocess reports output.
          useTypeScriptCli && typeCheckingSpinner
            ? () => typeCheckingSpinner.stop()
            : undefined
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
    typeCheckingSpinner?.stop()
    // prevent showing jest-worker internal error as it
    // isn't helpful for users and clutters output
    if (
      isError(err) &&
      (err.message === 'Call retries were exceeded' ||
        ('type' in err && err.type === 'WorkerError'))
    ) {
      await telemetry.flush()
      if (deferExitOnError) {
        throw new Error(
          'TypeScript checker worker exited unexpectedly. This may be caused by insufficient memory.'
        )
      }
      process.exit(1)
    }
    throw err
  }
}
