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
 * typescript will be loaded in "next/lib/verify-typescript-setup" and
 * then passed to "next/lib/typescript/runTypeCheck" as a parameter.
 *
 * Since it is impossible to pass a function from main thread to a worker,
 * instead of running "next/lib/typescript/runTypeCheck" in a worker,
 * we will run entire "next/lib/verify-typescript-setup" in a worker instead.
 */
function verifyTypeScriptSetup(
  dir: string,
  distDir: string,
  intentDirs: string[],
  typeCheckPreflight: boolean,
  tsconfigPath: string | undefined,
  disableStaticImages: boolean,
  cacheDir: string | undefined,
  enableWorkerThreads: boolean | undefined,
  hasAppDir: boolean,
  hasPagesDir: boolean,
  isolatedDevBuild: boolean | undefined
) {
  const typeCheckWorker = new Worker(
    require.resolve('../lib/verify-typescript-setup'),
    {
      exposedMethods: ['verifyTypeScriptSetup'],
      debuggerPortOffset: -1,
      isolatedMemory: false,
      numWorkers: 1,
      enableWorkerThreads,
      maxRetries: 0,
    }
  ) as Worker & {
    verifyTypeScriptSetup: typeof import('../lib/verify-typescript-setup').verifyTypeScriptSetup
  }

  return typeCheckWorker
    .verifyTypeScriptSetup({
      dir,
      distDir,
      intentDirs,
      typeCheckPreflight,
      tsconfigPath,
      disableStaticImages,
      cacheDir,
      hasAppDir,
      hasPagesDir,
      isolatedDevBuild,
    })
    .then((result) => {
      typeCheckWorker.end()
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
}: {
  cacheDir: string
  config: NextConfigComplete
  dir: string
  nextBuildSpan: Span
  pagesDir?: string
  telemetry: Telemetry
  appDir?: string
}) {
  const ignoreTypeScriptErrors = Boolean(config.typescript.ignoreBuildErrors)

  if (ignoreTypeScriptErrors) {
    Log.info('Skipping validation of types')
  }

  let typeCheckingSpinnerPrefixText: string | undefined
  let typeCheckingSpinner: ReturnType<typeof createSpinner> | undefined

  if (!ignoreTypeScriptErrors) {
    typeCheckingSpinnerPrefixText = 'Running TypeScript'
  }

  if (typeCheckingSpinnerPrefixText) {
    typeCheckingSpinner = createSpinner(typeCheckingSpinnerPrefixText)
  }

  const typeCheckAndLintStart = process.hrtime()

  try {
    const [verifyResult, typeCheckEnd] = await nextBuildSpan
      .traceChild('run-typescript')
      .traceAsyncFn(() =>
        verifyTypeScriptSetup(
          dir,
          config.distDir,
          [pagesDir, appDir].filter(Boolean) as string[],
          !ignoreTypeScriptErrors,
          config.typescript.tsconfigPath,
          config.images.disableStaticImages,
          cacheDir,
          config.experimental.workerThreads,
          !!appDir,
          !!pagesDir,
          config.experimental.isolatedDevBuild
        ).then((resolved) => {
          const checkEnd = process.hrtime(typeCheckAndLintStart)
          return [resolved, checkEnd] as const
        })
      )

    if (typeCheckingSpinner) {
      typeCheckingSpinner.stop()

      createSpinner(
        `Finished TypeScript${ignoreTypeScriptErrors ? ' config validation' : ''} in ${hrtimeDurationToString(typeCheckEnd)}`
      )?.stopAndPersist()
    }

    if (!ignoreTypeScriptErrors && verifyResult) {
      telemetry.record(
        eventTypeCheckCompleted({
          durationInSeconds: typeCheckEnd[0],
          typescriptVersion: verifyResult.version,
          inputFilesCount: verifyResult.result?.inputFilesCount,
          totalFilesCount: verifyResult.result?.totalFilesCount,
          incremental: verifyResult.result?.incremental,
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
