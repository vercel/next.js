import path from 'path'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import {
  formatIssue,
  getTurbopackJsConfig,
  isPersistentCachingEnabled,
  isRelevantWarning,
  type EntryIssuesMap,
} from '../../shared/lib/turbopack/utils'
import { NextBuildContext } from '../build-context'
import { createDefineEnv, loadBindings } from '../swc'
import { Sema } from 'next/dist/compiled/async-sema'
import {
  handleEntrypoints,
  handlePagesErrorRoute,
  handleRouteType,
} from '../handle-entrypoints'
import type { Entrypoints } from '../swc/types'
import { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import { createProgress } from '../progress'
import * as Log from '../output/log'
import { promises as fs } from 'fs'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import loadConfig from '../../server/config'
import { hasCustomExportOutput } from '../../export/utils'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'

const IS_TURBOPACK_BUILD = process.env.TURBOPACK && process.env.TURBOPACK_BUILD

export async function turbopackBuild(): Promise<{
  duration: number
  buildTraceContext: undefined
  shutdownPromise: Promise<void>
}> {
  if (!IS_TURBOPACK_BUILD) {
    throw new Error("next build doesn't support turbopack yet")
  }

  await validateTurboNextConfig({
    dir: NextBuildContext.dir!,
    isDev: false,
  })

  const config = NextBuildContext.config!
  const dir = NextBuildContext.dir!
  const distDir = NextBuildContext.distDir!
  const buildId = NextBuildContext.buildId!
  const encryptionKey = NextBuildContext.encryptionKey!
  const previewProps = NextBuildContext.previewProps!
  const hasRewrites = NextBuildContext.hasRewrites!
  const rewrites = NextBuildContext.rewrites!
  const appDirOnly = NextBuildContext.appDirOnly!
  const noMangling = NextBuildContext.noMangling!

  const startTime = process.hrtime()
  const bindings = await loadBindings(config?.experimental?.useWasmBinary)
  const dev = false

  // const supportedBrowsers = await getSupportedBrowsers(dir, dev)
  const supportedBrowsers = [
    'last 1 Chrome versions, last 1 Firefox versions, last 1 Safari versions, last 1 Edge versions',
  ]

  const persistentCaching = isPersistentCachingEnabled(config)
  const project = await bindings.turbo.createProject(
    {
      projectPath: dir,
      rootPath:
        config.experimental?.turbo?.root || config.outputFileTracingRoot || dir,
      distDir,
      nextConfig: config,
      jsConfig: await getTurbopackJsConfig(dir, config),
      watch: {
        enable: false,
      },
      dev,
      env: process.env as Record<string, string>,
      defineEnv: createDefineEnv({
        isTurbopack: true,
        clientRouterFilters: NextBuildContext.clientRouterFilters!,
        config,
        dev,
        distDir,
        fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
        hasRewrites,
        // Implemented separately in Turbopack, doesn't have to be passed here.
        middlewareMatchers: undefined,
      }),
      buildId,
      encryptionKey,
      previewProps,
      browserslistQuery: supportedBrowsers.join(', '),
      noMangling,
    },
    {
      persistentCaching,
      memoryLimit: config.experimental.turbo?.memoryLimit,
      dependencyTracking: persistentCaching,
    }
  )

  await fs.mkdir(path.join(distDir, 'server'), { recursive: true })
  await fs.mkdir(path.join(distDir, 'static', buildId), {
    recursive: true,
  })
  await fs.writeFile(
    path.join(distDir, 'package.json'),
    JSON.stringify(
      {
        type: 'commonjs',
      },
      null,
      2
    )
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const entrypointsSubscription = project.entrypointsSubscribe()
  const currentEntrypoints: Entrypoints = {
    global: {
      app: undefined,
      document: undefined,
      error: undefined,

      middleware: undefined,
      instrumentation: undefined,
    },

    app: new Map(),
    page: new Map(),
  }

  const currentEntryIssues: EntryIssuesMap = new Map()

  const manifestLoader = new TurbopackManifestLoader({
    buildId,
    distDir,
    encryptionKey,
  })

  const entrypointsResult = await entrypointsSubscription.next()
  if (entrypointsResult.done) {
    throw new Error('Turbopack did not return any entrypoints')
  }
  entrypointsSubscription.return?.().catch(() => {})

  const entrypoints = entrypointsResult.value

  const topLevelErrors: {
    message: string
  }[] = []
  for (const issue of entrypoints.issues) {
    topLevelErrors.push({
      message: formatIssue(issue),
    })
  }

  if (topLevelErrors.length > 0) {
    throw new Error(
      `Turbopack build failed with ${
        topLevelErrors.length
      } issues:\n${topLevelErrors.map((e) => e.message).join('\n')}`
    )
  }

  await handleEntrypoints({
    entrypoints,
    currentEntrypoints,
    currentEntryIssues,
    manifestLoader,
    productionRewrites: rewrites,
    logErrors: false,
  })

  const progress = createProgress(
    currentEntrypoints.page.size + currentEntrypoints.app.size + 1,
    'Building'
  )
  const promises: Promise<any>[] = []

  // Concurrency will start at INITIAL_CONCURRENCY and
  // slowly ramp up to CONCURRENCY by increasing the
  // concurrency by 1 every time a task is completed.
  const INITIAL_CONCURRENCY = 5
  const CONCURRENCY = 10

  const sema = new Sema(INITIAL_CONCURRENCY)
  let remainingRampup = CONCURRENCY - INITIAL_CONCURRENCY
  const enqueue = (fn: () => Promise<void>) => {
    promises.push(
      (async () => {
        await sema.acquire()
        try {
          await fn()
        } finally {
          sema.release()
          if (remainingRampup > 0) {
            remainingRampup--
            sema.release()
          }
          progress.run()
        }
      })()
    )
  }

  if (!appDirOnly) {
    for (const [page, route] of currentEntrypoints.page) {
      enqueue(() =>
        handleRouteType({
          page,
          route,
          currentEntryIssues,
          entrypoints: currentEntrypoints,
          manifestLoader,
          productionRewrites: rewrites,
          logErrors: false,
        })
      )
    }
  }

  for (const [page, route] of currentEntrypoints.app) {
    enqueue(() =>
      handleRouteType({
        page,
        route,
        currentEntryIssues,
        entrypoints: currentEntrypoints,
        manifestLoader,
        productionRewrites: rewrites,
        logErrors: false,
      })
    )
  }

  enqueue(() =>
    handlePagesErrorRoute({
      currentEntryIssues,
      entrypoints: currentEntrypoints,
      manifestLoader,
      productionRewrites: rewrites,
      logErrors: false,
    })
  )
  await Promise.all(promises)

  await manifestLoader.writeManifests({
    devRewrites: undefined,
    productionRewrites: rewrites,
    entrypoints: currentEntrypoints,
  })

  const errors: {
    page: string
    message: string
  }[] = []
  const warnings: {
    page: string
    message: string
  }[] = []
  for (const [page, entryIssues] of currentEntryIssues) {
    for (const issue of entryIssues.values()) {
      if (issue.severity !== 'warning') {
        errors.push({
          page,
          message: formatIssue(issue),
        })
      } else {
        if (isRelevantWarning(issue)) {
          warnings.push({
            page,
            message: formatIssue(issue),
          })
        }
      }
    }
  }

  const shutdownPromise = project.shutdown()

  if (warnings.length > 0) {
    Log.warn(
      `Turbopack build collected ${warnings.length} warnings:\n${warnings
        .map((e) => {
          return 'Page: ' + e.page + '\n' + e.message
        })
        .join('\n')}`
    )
  }

  if (errors.length > 0) {
    throw new Error(
      `Turbopack build failed with ${errors.length} errors:\n${errors
        .map((e) => {
          return 'Page: ' + e.page + '\n' + e.message
        })
        .join('\n')}`
    )
  }

  const time = process.hrtime(startTime)
  return {
    duration: time[0] + time[1] / 1e9,
    buildTraceContext: undefined,
    shutdownPromise,
  }
}

let shutdownPromise: Promise<void> | undefined
export async function workerMain(workerData: {
  buildContext: typeof NextBuildContext
}): Promise<Awaited<ReturnType<typeof turbopackBuild>>> {
  // setup new build context from the serialized data passed from the parent
  Object.assign(NextBuildContext, workerData.buildContext)

  /// load the config because it's not serializable
  NextBuildContext.config = await loadConfig(
    PHASE_PRODUCTION_BUILD,
    NextBuildContext.dir!
  )

  // Matches handling in build/index.ts
  // https://github.com/vercel/next.js/blob/84f347fc86f4efc4ec9f13615c215e4b9fb6f8f0/packages/next/src/build/index.ts#L815-L818
  // Ensures the `config.distDir` option is matched.
  if (hasCustomExportOutput(NextBuildContext.config)) {
    NextBuildContext.config.distDir = '.next'
  }

  // Clone the telemetry for worker
  const telemetry = new Telemetry({
    distDir: NextBuildContext.config.distDir,
  })
  setGlobal('telemetry', telemetry)

  const result = await turbopackBuild()
  shutdownPromise = result.shutdownPromise
  return result
}

export async function waitForShutdown(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise
  }
}
