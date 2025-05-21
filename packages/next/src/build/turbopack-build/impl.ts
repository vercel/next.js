import path from 'path'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import {
  formatIssue,
  getTurbopackJsConfig,
  isPersistentCachingEnabled,
  isRelevantWarning,
} from '../../shared/lib/turbopack/utils'
import { NextBuildContext } from '../build-context'
import { createDefineEnv, loadBindings } from '../swc'
import {
  rawEntrypointsToEntrypoints,
  handleRouteType,
} from '../handle-entrypoints'
import { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import { promises as fs } from 'fs'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import loadConfig from '../../server/config'
import { hasCustomExportOutput } from '../../export/utils'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'
import * as Log from '../output/log'

export async function turbopackBuild(): Promise<{
  duration: number
  buildTraceContext: undefined
  shutdownPromise: Promise<void>
}> {
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
      rootPath: config.turbopack?.root || config.outputFileTracingRoot || dir,
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
        projectPath: dir,
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
      memoryLimit: config.experimental?.turbopackMemoryLimit,
      dependencyTracking: persistentCaching,
    }
  )
  try {
    ;(async function logCompilationEvents() {
      for await (const event of project.compilationEventsSubscribe()) {
        switch (event.severity) {
          case 'EVENT':
            Log.event(event.message)
            break
          case 'TRACE':
            Log.trace(event.message)
            break
          case 'INFO':
            Log.info(event.message)
            break
          case 'WARNING':
            console.warn(event.message)
            break
          case 'ERROR':
            Log.error(event.message)
            break
          case 'FATAL':
            Log.error(event.message)
            break
          default:
            break
        }
      }
    })()

    // Write an empty file in a known location to signal this was built with Turbopack
    await fs.writeFile(path.join(distDir, 'turbopack'), '')

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
    const entrypoints = await project.writeAllEntrypointsToDisk(appDirOnly)

    const manifestLoader = new TurbopackManifestLoader({
      buildId,
      distDir,
      encryptionKey,
    })

    const topLevelErrors = []
    const topLevelWarnings = []
    for (const issue of entrypoints.issues) {
      if (issue.severity === 'error' || issue.severity === 'fatal') {
        topLevelErrors.push(formatIssue(issue))
      } else if (isRelevantWarning(issue)) {
        topLevelWarnings.push(formatIssue(issue))
      }
    }

    if (topLevelWarnings.length > 0) {
      console.warn(
        `Turbopack build encountered ${
          topLevelWarnings.length
        } warnings:\n${topLevelWarnings.join('\n')}`
      )
    }

    if (topLevelErrors.length > 0) {
      throw new Error(
        `Turbopack build failed with ${
          topLevelErrors.length
        } errors:\n${topLevelErrors.join('\n')}`
      )
    }

    const currentEntrypoints = await rawEntrypointsToEntrypoints(entrypoints)

    const promises: Promise<any>[] = []

    if (!appDirOnly) {
      for (const [page, route] of currentEntrypoints.page) {
        promises.push(
          handleRouteType({
            page,
            route,
            manifestLoader,
          })
        )
      }
    }

    for (const [page, route] of currentEntrypoints.app) {
      promises.push(
        handleRouteType({
          page,
          route,
          manifestLoader,
        })
      )
    }

    await Promise.all(promises)

    await Promise.all([
      manifestLoader.loadBuildManifest('_app'),
      manifestLoader.loadPagesManifest('_app'),
      manifestLoader.loadFontManifest('_app'),
      manifestLoader.loadPagesManifest('_document'),
      manifestLoader.loadBuildManifest('_error'),
      manifestLoader.loadPagesManifest('_error'),
      manifestLoader.loadFontManifest('_error'),
      entrypoints.instrumentation &&
        manifestLoader.loadMiddlewareManifest(
          'instrumentation',
          'instrumentation'
        ),
      entrypoints.middleware &&
        (await manifestLoader.loadMiddlewareManifest(
          'middleware',
          'middleware'
        )),
    ])

    await manifestLoader.writeManifests({
      devRewrites: undefined,
      productionRewrites: rewrites,
      entrypoints: currentEntrypoints,
    })

    const shutdownPromise = project.shutdown()

    const time = process.hrtime(startTime)
    return {
      duration: time[0] + time[1] / 1e9,
      buildTraceContext: undefined,
      shutdownPromise,
    }
  } catch (err) {
    await project.shutdown()
    throw err
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
