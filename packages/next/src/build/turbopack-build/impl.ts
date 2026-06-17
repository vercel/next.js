// Import cpu-profile first to start profiling early if enabled
import { saveCpuProfile } from '../../server/lib/cpu-profile'
import path from 'path'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import { NextBuildContext } from '../build-context'
import { createDefineEnv, getBindingsSync } from '../swc'
import { installBindings } from '../swc/install-bindings'
import {
  handleRouteType,
  rawEntrypointsToEntrypoints,
} from '../handle-entrypoints'
import { TurbopackManifestLoader } from '../../shared/lib/turbopack/manifest-loader'
import { promises as fs } from 'fs'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import loadConfig from '../../server/config'
import { hasCustomExportOutput } from '../../export/utils'
import { Telemetry } from '../../telemetry/storage'
import { eventBuildFeatureUsageFromTurbopack } from '../../telemetry/events/build'
import {
  setGlobal,
  trace,
  initializeTraceState,
  getTraceEvents,
} from '../../trace'
import type { TraceState } from '../../trace'
import { isCI } from '../../server/ci-info'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { getSupportedBrowsers } from '../get-supported-browsers'
import { printBuildErrors } from '../print-build-errors'
import { normalizePath } from '../../lib/normalize-path'
import type {
  ProjectOptions,
  RawEntrypoints,
  TurbopackResult,
} from '../swc/types'
import { Bundler } from '../../lib/bundler'

export async function turbopackBuild(telemetry: Telemetry): Promise<{
  duration: number
  buildTraceContext: undefined
  shutdownPromise: Promise<void>
}> {
  await validateTurboNextConfig({
    dir: NextBuildContext.dir!,
    configPhase: PHASE_PRODUCTION_BUILD,
  })

  const config = NextBuildContext.config!
  const dir = NextBuildContext.dir!
  const distDir = NextBuildContext.distDir!
  const buildId = NextBuildContext.buildId!
  const encryptionKey = NextBuildContext.encryptionKey!
  const previewProps = NextBuildContext.previewProps!
  const hasRewrites = NextBuildContext.hasRewrites!
  const rewrites = NextBuildContext.rewrites!
  const noMangling = NextBuildContext.noMangling!
  const currentNodeJsVersion = process.versions.node

  const startTime = process.hrtime()
  const bindings = getBindingsSync() // our caller should have already loaded these

  if (bindings.isWasm) {
    throw new Error(
      `Turbopack is not supported on this platform (${process.platform}/${process.arch}) because native bindings are not available. ` +
        `Only WebAssembly (WASM) bindings were loaded, and Turbopack requires native bindings.\n\n` +
        `To build on this platform, use Webpack instead:\n` +
        `  next build --webpack\n\n` +
        `For more information, see: https://nextjs.org/docs/app/api-reference/turbopack#supported-platforms`
    )
  }

  const dev = false

  const supportedBrowsers = getSupportedBrowsers(dir, dev)

  const hasDeferredEntries =
    (config.experimental.deferredEntries?.length ?? 0) > 0

  const persistentCaching =
    config.experimental?.turbopackFileSystemCacheForBuild || false
  const rootPath = config.turbopack?.root || config.outputFileTracingRoot || dir

  // Shared options for createProject calls
  const sharedProjectOptions: Omit<ProjectOptions, 'debugBuildPaths'> = {
    rootPath,
    projectPath: normalizePath(path.relative(rootPath, dir) || '.'),
    distDir,
    nextConfig: config,
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
      rewrites,
    }),
    buildId,
    encryptionKey,
    previewProps,
    browserslistQuery: supportedBrowsers.join(', '),
    noMangling,
    writeRoutesHashesManifest:
      !!process.env.NEXT_TURBOPACK_WRITE_ROUTES_HASHES_MANIFEST,
    currentNodeJsVersion,
    isPersistentCachingEnabled: persistentCaching,
    deferredEntries: config.experimental.deferredEntries,
    nextVersion: process.env.__NEXT_VERSION as string,
  }

  const sharedTurboOptions = {
    turbopackMemoryEviction: config.experimental.turbopackMemoryEvictionMode,
    dependencyTracking: persistentCaching || hasDeferredEntries,
    isCi: isCI,
    isShortSession: true,
    skipCompaction: process.env.NEXT_USE_POST_BUILD === '1',
  }

  const sriEnabled = Boolean(config.experimental.sri?.algorithm)

  const project = await bindings.turbo.createProject(
    {
      ...sharedProjectOptions,
      debugBuildPaths: NextBuildContext.debugBuildPaths,
    },
    sharedTurboOptions,
    hasDeferredEntries && config.experimental.onBeforeDeferredEntries
      ? {
          onBeforeDeferredEntries: async () => {
            const workerConfig = await loadConfig(PHASE_PRODUCTION_BUILD, dir, {
              debugPrerender: NextBuildContext.debugPrerender,
              reactProductionProfiling:
                NextBuildContext.reactProductionProfiling,
              bundler: Bundler.Turbopack,
            })

            await workerConfig.experimental.onBeforeDeferredEntries?.()
          },
        }
      : undefined
  )
  const buildEventsSpan = trace('turbopack-build-events')
  // Stop immediately: this span is only used as a parent for
  // manualTraceChild calls which carry their own timestamps.
  buildEventsSpan.stop()
  const shutdownController = new AbortController()
  const compilationEvents = backgroundLogCompilationEvents(project, {
    parentSpan: buildEventsSpan,
    signal: shutdownController.signal,
  })

  try {
    // Write an empty file in a known location to signal this was built with Turbopack
    await fs.writeFile(path.join(distDir, 'turbopack'), '')

    await fs.mkdir(path.join(distDir, 'server'), { recursive: true })
    await fs.mkdir(path.join(distDir, 'static', buildId), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(distDir, 'package.json'),
      '{"type": "commonjs"}'
    )

    let appDirOnly = NextBuildContext.appDirOnly!

    const entrypoints = await project.writeAllEntrypointsToDisk(appDirOnly)
    printBuildErrors(entrypoints, dev)

    // Skip when telemetry is fully off — featureUsage() isn't free.
    if (telemetry.isEnabled || process.env.NEXT_TELEMETRY_DEBUG) {
      try {
        const featureUsage = await project.featureUsage()
        const events = eventBuildFeatureUsageFromTurbopack(featureUsage)
        if (events.length > 0) {
          telemetry.record(events)
        }
      } catch (err) {
        // Telemetry must never break a build.
        console.warn('Failed to record Turbopack feature telemetry:', err)
      }
    }

    const routes = entrypoints.routes
    if (!routes) {
      // This should never ever happen, there should be an error issue, or the bindings call should
      // have thrown.
      throw new Error(`Turbopack build failed`)
    }

    const hasPagesEntries = Array.from(routes.values()).some((route) => {
      if (route.type === 'page' || route.type === 'page-api') {
        return true
      }
      return false
    })
    // If there's no pages entries, then we are in app-dir-only mode
    if (!hasPagesEntries) {
      appDirOnly = true
    }

    const manifestLoader = new TurbopackManifestLoader({
      buildId,
      distDir,
      encryptionKey,
      dev: false,
      sriEnabled,
    })

    const currentEntrypoints = await rawEntrypointsToEntrypoints(
      entrypoints as TurbopackResult<RawEntrypoints>
    )

    const promises: Promise<void>[] = []

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
      // Only load pages router manifests if not app-only
      ...(!appDirOnly
        ? [
            manifestLoader.loadBuildManifest('_app'),
            manifestLoader.loadPagesManifest('_app'),
            manifestLoader.loadFontManifest('_app'),
            manifestLoader.loadPagesManifest('_document'),
            manifestLoader.loadClientBuildManifest('_error'),
            manifestLoader.loadBuildManifest('_error'),
            manifestLoader.loadPagesManifest('_error'),
            manifestLoader.loadFontManifest('_error'),
          ]
        : []),
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

    manifestLoader.writeManifests({
      devRewrites: undefined,
      productionRewrites: rewrites,
      entrypoints: currentEntrypoints,
    })

    if (NextBuildContext.analyze) {
      await project.writeAnalyzeData(appDirOnly)
    }

    // Shutdown may trigger final compilation events (e.g. persistence,
    // compaction trace spans).  This is the last chance to capture them.
    // After shutdown resolves we abort the signal to close the iterator
    // and drain any remaining buffered events.
    const shutdownPromise = project.shutdown().then(() => {
      shutdownController.abort()
      return compilationEvents.catch(() => {})
    })

    const time = process.hrtime(startTime)
    return {
      duration: time[0] + time[1] / 1e9,
      buildTraceContext: undefined,
      shutdownPromise,
    }
  } catch (err) {
    await project.shutdown()
    shutdownController.abort()
    await compilationEvents.catch(() => {})
    throw err
  }
}

let shutdownPromise: Promise<void> | undefined
export async function workerMain(workerData: {
  buildContext: typeof NextBuildContext
  traceState: TraceState & { shouldSaveTraceEvents: boolean }
}): Promise<
  Omit<Awaited<ReturnType<typeof turbopackBuild>>, 'shutdownPromise'>
> {
  // setup new build context from the serialized data passed from the parent
  Object.assign(NextBuildContext, workerData.buildContext)
  initializeTraceState(workerData.traceState)

  /// load the config because it's not serializable
  const config = await loadConfig(
    PHASE_PRODUCTION_BUILD,
    NextBuildContext.dir!,
    {
      debugPrerender: NextBuildContext.debugPrerender,
      reactProductionProfiling: NextBuildContext.reactProductionProfiling,
      bundler: Bundler.Turbopack,
    }
  )
  NextBuildContext.config = config
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
  // Install bindings early so we can access synchronously later
  await installBindings(config.experimental?.useWasmBinary)

  try {
    const {
      shutdownPromise: resultShutdownPromise,
      buildTraceContext,
      duration,
    } = await turbopackBuild(telemetry)
    shutdownPromise = resultShutdownPromise
    return {
      buildTraceContext,
      duration,
    }
  } finally {
    // Always flush telemetry before worker exits (waits for async operations like setTimeout in debug mode)
    await telemetry.flush()
    // Save CPU profile before worker exits
    await saveCpuProfile()
  }
}

export async function waitForShutdown(): Promise<{
  debugTraceEvents?: ReturnType<typeof getTraceEvents>
}> {
  if (shutdownPromise) {
    await shutdownPromise
  }
  // Collect trace events after shutdown completes so that all compilation
  // events (e.g. persistence trace spans) have been processed.
  return { debugTraceEvents: getTraceEvents() }
}
