// Import cpu-profile first to start profiling early if enabled
import { saveCpuProfile } from '../../server/lib/cpu-profile'
import path from 'path'
import { validateTurboNextConfig } from '../../lib/turbopack-warning'
import { isMetadataRouteFile } from '../../lib/metadata/is-metadata-route'
import {
  normalizeMetadataPageToRoute,
  normalizeMetadataRoute,
} from '../../lib/metadata/get-metadata-route'
import { isFileSystemCacheEnabledForBuild } from '../../shared/lib/turbopack/utils'
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
import { setGlobal } from '../../trace'
import { isCI } from '../../server/ci-info'
import { backgroundLogCompilationEvents } from '../../shared/lib/turbopack/compilation-events'
import { getSupportedBrowsers, printBuildErrors } from '../utils'
import { normalizePath } from '../../lib/normalize-path'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import {
  collectAppFiles,
  collectPagesFiles,
  getPageFromPath,
} from '../route-discovery'
import { createValidFileMatcher } from '../../server/lib/find-page-file'
import type {
  ProjectOptions,
  RawEntrypoints,
  TurbopackResult,
} from '../swc/types'

/**
 * Convert an app route path to debugBuildPaths format.
 * e.g. '/' -> '/page', '/blog' -> '/blog/page'
 */
function toAppDebugPath(route: string, leaf: 'page' | 'route'): string {
  const routePath = route.startsWith('/') ? route : `/${route}`
  return routePath === '/' ? `/${leaf}` : `${routePath}/${leaf}`
}

function normalizeDeferredRoute(route: string): string {
  const normalized = route.startsWith('/') ? route : `/${route}`
  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1)
  }
  return normalized
}

/**
 * Matches deferred entries with webpack parity:
 * - exact route match
 * - prefix match for directory-style deferred entries
 */
function isDeferredAppRoute(route: string, deferredEntries: string[]): boolean {
  const normalizedRoute = normalizeDeferredRoute(route)

  for (const entry of deferredEntries) {
    const normalizedEntry = normalizeDeferredRoute(entry)
    if (normalizedRoute === normalizedEntry) {
      return true
    }
    if (normalizedRoute.startsWith(`${normalizedEntry}/`)) {
      return true
    }
  }

  return false
}

function getAppDebugPaths(
  appPath: string,
  pageExtensions: string[]
): {
  isPageRoute: boolean
  normalizedRoute: string
  isMetadataRoute: boolean
  debugPaths: string[]
} {
  const page = getPageFromPath(appPath, pageExtensions)
  const isMetadataRoute = isMetadataRouteFile(appPath, pageExtensions, true)
  const metadataRoute = isMetadataRoute ? normalizeMetadataRoute(page) : null
  const routeCandidates = isMetadataRoute
    ? [
        metadataRoute!,
        normalizeMetadataPageToRoute(metadataRoute!, false),
        normalizeMetadataPageToRoute(metadataRoute!, true),
      ]
    : [page]

  const debugPaths = Array.from(
    new Set(
      routeCandidates.map((routeCandidate) =>
        toAppDebugPath(
          normalizeAppPath(routeCandidate),
          routeCandidate.endsWith('/route') ? 'route' : 'page'
        )
      )
    )
  )

  return {
    isPageRoute: !isMetadataRoute && page.endsWith('/page'),
    normalizedRoute: normalizeAppPath(page),
    isMetadataRoute,
    debugPaths,
  }
}

/**
 * Collect deferred app routes and metadata routes in debugBuildPaths format.
 * @param pagesPaths - All pages routes to include (deferred entries only affects app routes)
 */
function getDeferredBuildPaths(
  deferredEntries: string[],
  appPaths: string[],
  pageExtensions: string[],
  pagesPaths: string[]
): {
  app: string[]
  pages: string[]
} {
  const deferredAppPaths: string[] = []
  for (const appPath of appPaths) {
    const { isPageRoute, normalizedRoute, isMetadataRoute, debugPaths } =
      getAppDebugPaths(appPath, pageExtensions)
    if (
      (isPageRoute && isDeferredAppRoute(normalizedRoute, deferredEntries)) ||
      isMetadataRoute
    ) {
      deferredAppPaths.push(...debugPaths)
    }
  }

  return {
    app: [...new Set(deferredAppPaths)],
    // Include all pages routes so they are not filtered out
    pages: pagesPaths,
  }
}

/**
 * Collect app entries and filter out deferred app pages only.
 * This keeps non-page app entries (e.g. route handlers) in the non-deferred build.
 * @param pagesPaths - All pages routes to include (deferred entries only affects app routes)
 */
function getNonDeferredBuildPaths(
  appPaths: string[],
  deferredEntries: string[],
  pageExtensions: string[],
  pagesPaths: string[]
): { app: string[]; pages: string[] } | null {
  if (deferredEntries.length === 0) {
    return null
  }

  const nonDeferredAppPaths: string[] = []
  for (const appPath of appPaths) {
    const { isPageRoute, normalizedRoute, debugPaths } = getAppDebugPaths(
      appPath,
      pageExtensions
    )
    const isDeferredPage =
      isPageRoute && isDeferredAppRoute(normalizedRoute, deferredEntries)
    if (!isDeferredPage) {
      nonDeferredAppPaths.push(...debugPaths)
    }
  }

  return {
    app: [...new Set(nonDeferredAppPaths)],
    // Include all pages routes so they are not filtered out
    pages: pagesPaths,
  }
}

export async function turbopackBuild(): Promise<{
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

  // Handle deferred entries configuration
  const deferredEntries = config.experimental.deferredEntries || []
  const hasDeferredEntries = deferredEntries.length > 0
  const onBeforeDeferredEntries = config.experimental.onBeforeDeferredEntries

  // Collect all pages paths when using deferred entries to ensure pages routes
  // are not filtered out (deferred entries only affects app routes)
  let pagesPaths: string[] = []
  let appPaths: string[] = []
  if (hasDeferredEntries && NextBuildContext.pagesDir) {
    const validFileMatcher = createValidFileMatcher(
      config.pageExtensions!,
      NextBuildContext.appDir
    )
    pagesPaths = await collectPagesFiles(
      NextBuildContext.pagesDir,
      validFileMatcher
    )
  }
  if (hasDeferredEntries && NextBuildContext.appDir) {
    const validFileMatcher = createValidFileMatcher(
      config.pageExtensions!,
      NextBuildContext.appDir
    )
    ;({ appPaths } = await collectAppFiles(
      NextBuildContext.appDir,
      validFileMatcher
    ))
  }

  // For deferred entries, we use debugBuildPaths to control which routes are built
  // First build excludes deferred entries, second build includes only deferred entries
  const nonDeferredBuildPaths =
    hasDeferredEntries && NextBuildContext.appDir
      ? getNonDeferredBuildPaths(
          appPaths,
          deferredEntries,
          config.pageExtensions!,
          pagesPaths
        )
      : null
  const deferredBuildPaths =
    hasDeferredEntries && NextBuildContext.appDir
      ? getDeferredBuildPaths(
          deferredEntries,
          appPaths,
          config.pageExtensions!,
          pagesPaths
        )
      : null

  const persistentCaching = isFileSystemCacheEnabledForBuild(config)
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
  }

  const sharedTurboOptions = {
    memoryLimit: config.experimental?.turbopackMemoryLimit,
    dependencyTracking: persistentCaching,
    isCi: isCI,
    isShortSession: true,
  }

  const project = await bindings.turbo.createProject(
    {
      ...sharedProjectOptions,
      // For deferred entries, first build only non-deferred routes
      debugBuildPaths:
        nonDeferredBuildPaths ?? NextBuildContext.debugBuildPaths,
    },
    sharedTurboOptions
  )
  try {
    backgroundLogCompilationEvents(project)

    // Write an empty file in a known location to signal this was built with Turbopack
    await fs.writeFile(path.join(distDir, 'turbopack'), '')

    await fs.mkdir(path.join(distDir, 'server'), { recursive: true })
    if (!config.deploymentId) {
      await fs.mkdir(path.join(distDir, 'static', buildId), {
        recursive: true,
      })
    }
    await fs.writeFile(
      path.join(distDir, 'package.json'),
      '{"type": "commonjs"}'
    )

    let appDirOnly = NextBuildContext.appDirOnly!

    // First build: without deferred entries (they're renamed to .deferred)
    let entrypoints = await project.writeAllEntrypointsToDisk(appDirOnly)
    printBuildErrors(entrypoints, dev)

    let routes = entrypoints.routes
    if (!routes) {
      // This should never ever happen, there should be an error issue, or the bindings call should
      // have thrown.
      throw new Error(`Turbopack build failed`)
    }

    // Track which project to shutdown at the end
    let activeProject = project

    // Handle deferred entries: call callback and do second build
    if (deferredBuildPaths) {
      // Call onBeforeDeferredEntries callback after first build completes
      if (onBeforeDeferredEntries) {
        await onBeforeDeferredEntries()
      }

      // Shutdown the first project instance
      await project.shutdown()

      // Create a new project instance with debugBuildPaths for only deferred routes
      // A new project is needed because turbo_tasks caches entrypoints discovery
      activeProject = await bindings.turbo.createProject(
        {
          ...sharedProjectOptions,
          debugBuildPaths: deferredBuildPaths,
        },
        sharedTurboOptions
      )

      backgroundLogCompilationEvents(activeProject)

      // Second build: only build deferred entries
      const deferredEntrypoints =
        await activeProject.writeAllEntrypointsToDisk(appDirOnly)
      printBuildErrors(deferredEntrypoints, dev)

      const deferredRoutes = deferredEntrypoints.routes
      if (!deferredRoutes) {
        throw new Error(`Turbopack build failed`)
      }

      // Merge deferred routes into the main routes
      for (const [key, value] of deferredRoutes) {
        routes.set(key, value)
      }

      // Update entrypoints to include merged routes for manifest processing
      entrypoints = {
        ...entrypoints,
        routes,
      }
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
      deploymentId: config.deploymentId,
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
      await activeProject.writeAnalyzeData(appDirOnly)
    }

    const shutdownPromise = activeProject.shutdown()

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
}): Promise<
  Omit<Awaited<ReturnType<typeof turbopackBuild>>, 'shutdownPromise'>
> {
  // setup new build context from the serialized data passed from the parent
  Object.assign(NextBuildContext, workerData.buildContext)

  /// load the config because it's not serializable
  const config = await loadConfig(
    PHASE_PRODUCTION_BUILD,
    NextBuildContext.dir!,
    {
      debugPrerender: NextBuildContext.debugPrerender,
      reactProductionProfiling: NextBuildContext.reactProductionProfiling,
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
    } = await turbopackBuild()
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

export async function waitForShutdown(): Promise<void> {
  if (shutdownPromise) {
    await shutdownPromise
  }
}
