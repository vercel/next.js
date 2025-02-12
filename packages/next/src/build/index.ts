import type { AppBuildManifest } from './webpack/plugins/app-build-manifest-plugin'
import type { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import type { ActionManifest } from './webpack/plugins/flight-client-entry-plugin'
import type { Revalidate } from '../server/lib/revalidate'

import '../lib/setup-exception-listeners'

import { loadEnvConfig, type LoadedEnvFiles } from '@next/env'
import { bold, yellow } from '../lib/picocolors'
import crypto from 'crypto'
import { makeRe } from 'next/dist/compiled/picomatch'
import { existsSync, promises as fs } from 'fs'
import os from 'os'
import { Worker } from '../lib/worker'
import { defaultConfig } from '../server/config-shared'
import devalue from 'next/dist/compiled/devalue'
import findUp from 'next/dist/compiled/find-up'
import { nanoid } from 'next/dist/compiled/nanoid/index.cjs'
import path from 'path'
import {
  STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
  MIDDLEWARE_FILENAME,
  PAGES_DIR_ALIAS,
  INSTRUMENTATION_HOOK_FILENAME,
  RSC_PREFETCH_SUFFIX,
  RSC_SUFFIX,
  NEXT_RESUME_HEADER,
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  MATCHED_PATH_HEADER,
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SEGMENT_SUFFIX,
} from '../lib/constants'
import { FileType, fileExists } from '../lib/file-exists'
import { findPagesDir } from '../lib/find-pages-dir'
import loadCustomRoutes, {
  normalizeRouteRegex,
} from '../lib/load-custom-routes'
import type {
  CustomRoutes,
  Header,
  Redirect,
  Rewrite,
  RouteHas,
} from '../lib/load-custom-routes'
import { nonNullable } from '../lib/non-nullable'
import { recursiveDelete } from '../lib/recursive-delete'
import { verifyPartytownSetup } from '../lib/verify-partytown-setup'
import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  IMAGES_MANIFEST,
  PAGES_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  PRERENDER_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVER_DIRECTORY,
  SERVER_FILES_MANIFEST,
  STATIC_STATUS_PAGES,
  MIDDLEWARE_MANIFEST,
  APP_PATHS_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  APP_BUILD_MANIFEST,
  RSC_MODULE_TYPES,
  NEXT_FONT_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  FUNCTIONS_CONFIG_MANIFEST,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_NOT_FOUND_ROUTE,
  DYNAMIC_CSS_MANIFEST,
  RESPONSE_CONFIG_MANIFEST,
} from '../shared/lib/constants'
import {
  getSortedRoutes,
  isDynamicRoute,
  getSortedRouteObjects,
} from '../shared/lib/router/utils'
import type { __ApiPreviewProps } from '../server/api-utils'
import loadConfig from '../server/config'
import type { BuildManifest } from '../server/get-page-files'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getPagePath } from '../server/require'
import * as ciEnvironment from '../server/ci-info'
import {
  turborepoTraceAccess,
  TurborepoAccessTraceResult,
  writeTurborepoAccessTraceResult,
} from './turborepo-access-trace'

import {
  eventBuildOptimize,
  eventCliSession,
  eventBuildFeatureUsage,
  eventNextPlugins,
  EVENT_BUILD_FEATURE_USAGE,
  eventPackageUsedInGetServerSideProps,
  eventBuildCompleted,
} from '../telemetry/events'
import type { EventBuildFeatureUsage } from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import { hadUnsupportedValue } from './analysis/get-page-static-info'
import {
  createPagesMapping,
  getStaticInfoIncludingLayouts,
  sortByPageExts,
} from './entries'
import { PAGE_TYPES } from '../lib/page-types'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import * as Log from './output/log'
import createSpinner from './spinner'
import { trace, flushAllTraces, setGlobal, type Span } from '../trace'
import {
  detectConflictingPaths,
  computeFromManifest,
  getJsPageSizeInKb,
  printCustomRoutes,
  printTreeView,
  copyTracedFiles,
  isReservedPage,
  isAppBuiltinNotFoundPage,
  collectRoutesUsingEdgeRuntime,
  collectMeta,
} from './utils'
import type { PageInfo, PageInfos } from './utils'
import type { PrerenderedRoute } from './static-paths/types'
import type { AppSegmentConfig } from './segment-config/app/app-segment-config'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import isError from '../lib/is-error'
import type { NextError } from '../lib/is-error'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { lockfilePatchPromise, teardownTraceSubscriber } from './swc'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import { getFilesInDir } from '../lib/get-files-in-dir'
import { eventSwcPlugins } from '../telemetry/events/swc-plugins'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import {
  ACTION_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
} from '../client/components/app-router-headers'
import { webpackBuild } from './webpack-build'
import { NextBuildContext, type MappedPages } from './build-context'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { createClientRouterFilter } from '../lib/create-client-router-filter'
import { createValidFileMatcher } from '../server/lib/find-page-file'
import { startTypeChecking } from './type-check'
import { generateInterceptionRoutesRewrites } from '../lib/generate-interception-routes-rewrites'

import { buildDataRoute } from '../server/lib/router-utils/build-data-route'
import { collectBuildTraces } from './collect-build-traces'
import type { BuildTraceContext } from './webpack/plugins/next-trace-entrypoints-plugin'
import { formatManifest } from './manifests/formatter/format-manifest'
import {
  recordFrameworkVersion,
  updateBuildDiagnostics,
  recordFetchMetrics,
} from '../diagnostics/build-diagnostics'
import { getStartServerInfo, logStartInfo } from '../server/lib/app-info-log'
import type { NextEnabledDirectories } from '../server/base-server'
import { hasCustomExportOutput } from '../export/utils'
import { buildCustomRoute } from '../lib/build-custom-route'
import { traceMemoryUsage } from '../lib/memory/trace'
import { generateEncryptionKeyBase64 } from '../server/app-render/encryption-utils-server'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import uploadTrace from '../trace/upload-trace'
import {
  checkIsAppPPREnabled,
  checkIsRoutePPREnabled,
} from '../server/lib/experimental/ppr'
import { FallbackMode, fallbackModeToFallbackField } from '../lib/fallback'
import { RenderingMode } from './rendering-mode'
import { getParamKeys } from '../server/request/fallback-params'
import {
  formatNodeOptions,
  getParsedNodeOptionsWithoutInspect,
} from '../server/lib/utils'
import { InvariantError } from '../shared/lib/invariant-error'
import { HTML_LIMITED_BOT_UA_RE_STRING } from '../shared/lib/router/utils/is-bot'
import type { UseCacheTrackerKey } from './webpack/plugins/telemetry-plugin/use-cache-tracker-utils'
import {
  buildPrefetchSegmentDataRoute,
  type PrefetchSegmentDataRoute,
} from '../server/lib/router-utils/build-prefetch-segment-data-route'

import { turbopackBuild } from './turbopack-build'

type Fallback = null | boolean | string

export interface SsgRoute {
  dataRoute: string | null
  experimentalBypassFor?: RouteHas[]

  /**
   * The headers that should be served along side this prerendered route.
   */
  initialHeaders?: Record<string, string>

  /**
   * The status code that should be served along side this prerendered route.
   */
  initialStatus?: number

  /**
   * The revalidation configuration for this route.
   */
  initialRevalidateSeconds: Revalidate

  /**
   * The prefetch data route associated with this page. If not defined, this
   * page does not support prefetching.
   */
  prefetchDataRoute: string | null | undefined

  /**
   * The dynamic route that this statically prerendered route is based on. If
   * this is null, then the route was not based on a dynamic route.
   */
  srcRoute: string | null

  /**
   * @deprecated use `renderingMode` instead
   */
  experimentalPPR: boolean | undefined

  /**
   * The rendering mode for this route. Only `undefined` when not an app router
   * route.
   */
  renderingMode: RenderingMode | undefined

  /**
   * The headers that are allowed to be used when revalidating this route. These
   * are used internally by Next.js to revalidate routes.
   */
  allowHeader: string[]
}

export interface DynamicSsgRoute {
  dataRoute: string | null
  dataRouteRegex: string | null
  experimentalBypassFor?: RouteHas[]
  fallback: Fallback

  /**
   * When defined, it describes the revalidation configuration for the fallback
   * route.
   */
  fallbackRevalidate: Revalidate | undefined

  /**
   * The headers that should used when serving the fallback.
   */
  fallbackHeaders?: Record<string, string>

  /**
   * The status code that should be used when serving the fallback.
   */
  fallbackStatus?: number

  /**
   * The root params that are unknown for this fallback route.
   */
  fallbackRootParams: readonly string[] | undefined

  /**
   * The source route that this fallback route is based on. This is a reference
   * so that we can associate this dynamic route with the correct source.
   */
  fallbackSourceRoute: string | undefined

  prefetchDataRoute: string | null | undefined
  prefetchDataRouteRegex: string | null | undefined
  routeRegex: string

  /**
   * @deprecated use `renderingMode` instead
   */
  experimentalPPR: boolean | undefined

  /**
   * The rendering mode for this route. Only `undefined` when not an app router
   * route.
   */
  renderingMode: RenderingMode | undefined

  /**
   * The headers that are allowed to be used when revalidating this route. These
   * are used internally by Next.js to revalidate routes.
   */
  allowHeader: string[]
}

/**
 * The headers that are allowed to be used when revalidating routes. Currently
 * this includes both headers used by the pages and app routers.
 */
const ALLOWED_HEADERS: string[] = [
  'host',
  MATCHED_PATH_HEADER,
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
  NEXT_CACHE_REVALIDATED_TAGS_HEADER,
  NEXT_CACHE_REVALIDATE_TAG_TOKEN_HEADER,
]

export type PrerenderManifest = {
  version: 4
  routes: { [route: string]: SsgRoute }
  dynamicRoutes: { [route: string]: DynamicSsgRoute }
  notFoundRoutes: string[]
  preview: __ApiPreviewProps
}

type ManifestBuiltRoute = {
  /**
   * The route pattern used to match requests for this route.
   */
  regex: string
}

export type ManifestRewriteRoute = ManifestBuiltRoute & Rewrite
export type ManifestRedirectRoute = ManifestBuiltRoute & Redirect
export type ManifestHeaderRoute = ManifestBuiltRoute & Header

export type ManifestRoute = ManifestBuiltRoute & {
  page: string
  namedRegex?: string
  routeKeys?: { [key: string]: string }
  prefetchSegmentDataRoutes?: PrefetchSegmentDataRoute[]
}

type ManifestDataRoute = {
  page: string
  routeKeys?: { [key: string]: string }
  dataRouteRegex: string
  namedDataRouteRegex?: string
}

export type RoutesManifest = {
  version: number
  pages404: boolean
  basePath: string
  redirects: Array<Redirect>
  rewrites?:
    | Array<ManifestRewriteRoute>
    | {
        beforeFiles: Array<ManifestRewriteRoute>
        afterFiles: Array<ManifestRewriteRoute>
        fallback: Array<ManifestRewriteRoute>
      }
  headers: Array<ManifestHeaderRoute>
  staticRoutes: Array<ManifestRoute>
  dynamicRoutes: Array<ManifestRoute>
  dataRoutes: Array<ManifestDataRoute>
  i18n?: {
    domains?: ReadonlyArray<{
      http?: true
      domain: string
      locales?: readonly string[]
      defaultLocale: string
    }>
    locales: readonly string[]
    defaultLocale: string
    localeDetection?: false
  }
  rsc: {
    header: typeof RSC_HEADER
    didPostponeHeader: typeof NEXT_DID_POSTPONE_HEADER
    contentTypeHeader: typeof RSC_CONTENT_TYPE_HEADER
    varyHeader: string
    prefetchHeader: typeof NEXT_ROUTER_PREFETCH_HEADER
    suffix: typeof RSC_SUFFIX
    prefetchSuffix: typeof RSC_PREFETCH_SUFFIX
    prefetchSegmentHeader: typeof NEXT_ROUTER_SEGMENT_PREFETCH_HEADER
    prefetchSegmentDirSuffix: typeof RSC_SEGMENTS_DIR_SUFFIX
    prefetchSegmentSuffix: typeof RSC_SEGMENT_SUFFIX
  }
  rewriteHeaders: {
    pathHeader: typeof NEXT_REWRITTEN_PATH_HEADER
    queryHeader: typeof NEXT_REWRITTEN_QUERY_HEADER
  }
  skipMiddlewareUrlNormalize?: boolean
  caseSensitive?: boolean
  /**
   * Configuration related to Partial Prerendering.
   */
  ppr?: {
    /**
     * The chained response for the PPR resume.
     */
    chain: {
      /**
       * The headers that will indicate to Next.js that the request is for a PPR
       * resume.
       */
      headers: Record<string, string>
    }
  }
}

function pageToRoute(page: string) {
  const routeRegex = getNamedRouteRegex(page, {
    prefixRouteKeys: true,
  })
  return {
    page,
    regex: normalizeRouteRegex(routeRegex.re.source),
    routeKeys: routeRegex.routeKeys,
    namedRegex: routeRegex.namedRegex,
  }
}

function getCacheDir(distDir: string): string {
  const cacheDir = path.join(distDir, 'cache')
  if (ciEnvironment.isCI && !ciEnvironment.hasNextSupport) {
    const hasCache = existsSync(cacheDir)

    if (!hasCache) {
      // Intentionally not piping to stderr which is what `Log.warn` does in case people fail in CI when
      // stderr is detected.
      console.log(
        `${Log.prefixes.warn} No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache`
      )
    }
  }
  return cacheDir
}

async function writeFileUtf8(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}

function readFileUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8')
}

async function writeManifest<T extends object>(
  filePath: string,
  manifest: T
): Promise<void> {
  await writeFileUtf8(filePath, formatManifest(manifest))
}

async function readManifest<T extends object>(filePath: string): Promise<T> {
  return JSON.parse(await readFileUtf8(filePath))
}

async function writePrerenderManifest(
  distDir: string,
  manifest: DeepReadonly<PrerenderManifest>
): Promise<void> {
  await writeManifest(path.join(distDir, PRERENDER_MANIFEST), manifest)
}

async function writeClientSsgManifest(
  prerenderManifest: DeepReadonly<PrerenderManifest>,
  {
    buildId,
    distDir,
    locales,
  }: {
    buildId: string
    distDir: string
    locales: readonly string[] | undefined
  }
) {
  const ssgPages = new Set<string>(
    [
      ...Object.entries(prerenderManifest.routes)
        // Filter out dynamic routes
        .filter(([, { srcRoute }]) => srcRoute == null)
        .map(([route]) => normalizeLocalePath(route, locales).pathname),
      ...Object.keys(prerenderManifest.dynamicRoutes),
    ].sort()
  )

  const clientSsgManifestContent = `self.__SSG_MANIFEST=${devalue(
    ssgPages
  )};self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

  await writeFileUtf8(
    path.join(distDir, CLIENT_STATIC_FILES_PATH, buildId, '_ssgManifest.js'),
    clientSsgManifestContent
  )
}

export interface FunctionsConfigManifest {
  version: number
  functions: Record<
    string,
    {
      maxDuration?: number | undefined
      runtime?: 'nodejs'
      matchers?: Array<{
        regexp: string
        originalSource: string
        has?: Rewrite['has']
        missing?: Rewrite['has']
      }>
    }
  >
}

async function writeFunctionsConfigManifest(
  distDir: string,
  manifest: FunctionsConfigManifest
): Promise<void> {
  await writeManifest(
    path.join(distDir, SERVER_DIRECTORY, FUNCTIONS_CONFIG_MANIFEST),
    manifest
  )
}

interface RequiredServerFilesManifest {
  version: number
  config: NextConfigComplete
  appDir: string
  relativeAppDir: string
  files: string[]
  ignore: string[]
}

async function writeRequiredServerFilesManifest(
  distDir: string,
  requiredServerFiles: RequiredServerFilesManifest
) {
  await writeManifest(
    path.join(distDir, SERVER_FILES_MANIFEST),
    requiredServerFiles
  )
}

async function writeImagesManifest(
  distDir: string,
  config: NextConfigComplete
): Promise<void> {
  const images = { ...config.images }
  const { deviceSizes, imageSizes } = images
  ;(images as any).sizes = [...deviceSizes, ...imageSizes]

  // By default, remotePatterns will allow no remote images ([])
  images.remotePatterns = (config?.images?.remotePatterns || []).map((p) => ({
    // Modifying the manifest should also modify matchRemotePattern()
    protocol: p.protocol,
    hostname: makeRe(p.hostname).source,
    port: p.port,
    pathname: makeRe(p.pathname ?? '**', { dot: true }).source,
    search: p.search,
  }))

  // By default, localPatterns will allow all local images (undefined)
  if (config?.images?.localPatterns) {
    images.localPatterns = config.images.localPatterns.map((p) => ({
      // Modifying the manifest should also modify matchLocalPattern()
      pathname: makeRe(p.pathname ?? '**', { dot: true }).source,
      search: p.search,
    }))
  }

  await writeManifest(path.join(distDir, IMAGES_MANIFEST), {
    version: 1,
    images,
  })
}

const STANDALONE_DIRECTORY = 'standalone' as const
async function writeStandaloneDirectory(
  nextBuildSpan: Span,
  distDir: string,
  pageKeys: { pages: string[]; app: string[] | undefined },
  denormalizedAppPages: string[] | undefined,
  outputFileTracingRoot: string,
  requiredServerFiles: RequiredServerFilesManifest,
  middlewareManifest: MiddlewareManifest,
  hasNodeMiddleware: boolean,
  hasInstrumentationHook: boolean,
  staticPages: Set<string>,
  loadedEnvFiles: LoadedEnvFiles,
  appDir: string | undefined
) {
  await nextBuildSpan
    .traceChild('write-standalone-directory')
    .traceAsyncFn(async () => {
      await copyTracedFiles(
        // requiredServerFiles.appDir Refers to the application directory, not App Router.
        requiredServerFiles.appDir,
        distDir,
        pageKeys.pages,
        denormalizedAppPages,
        outputFileTracingRoot,
        requiredServerFiles.config,
        middlewareManifest,
        hasNodeMiddleware,
        hasInstrumentationHook,
        staticPages
      )

      for (const file of [
        ...requiredServerFiles.files,
        path.join(requiredServerFiles.config.distDir, SERVER_FILES_MANIFEST),
        ...loadedEnvFiles.reduce<string[]>((acc, envFile) => {
          if (['.env', '.env.production'].includes(envFile.path)) {
            acc.push(envFile.path)
          }
          return acc
        }, []),
      ]) {
        // requiredServerFiles.appDir Refers to the application directory, not App Router.
        const filePath = path.join(requiredServerFiles.appDir, file)
        const outputPath = path.join(
          distDir,
          STANDALONE_DIRECTORY,
          path.relative(outputFileTracingRoot, filePath)
        )
        await fs.mkdir(path.dirname(outputPath), {
          recursive: true,
        })
        await fs.copyFile(filePath, outputPath)
      }

      if (hasNodeMiddleware) {
        const middlewareOutput = path.join(
          distDir,
          STANDALONE_DIRECTORY,
          requiredServerFiles.config.distDir,
          SERVER_DIRECTORY,
          'middleware.js'
        )

        await fs.mkdir(path.dirname(middlewareOutput), { recursive: true })
        await fs.copyFile(
          path.join(distDir, SERVER_DIRECTORY, 'middleware.js'),
          middlewareOutput
        )
      }

      await recursiveCopy(
        path.join(distDir, SERVER_DIRECTORY, 'pages'),
        path.join(
          distDir,
          STANDALONE_DIRECTORY,
          path.relative(outputFileTracingRoot, distDir),
          SERVER_DIRECTORY,
          'pages'
        ),
        { overwrite: true }
      )
      if (appDir) {
        const originalServerApp = path.join(distDir, SERVER_DIRECTORY, 'app')
        if (existsSync(originalServerApp)) {
          await recursiveCopy(
            originalServerApp,
            path.join(
              distDir,
              STANDALONE_DIRECTORY,
              path.relative(outputFileTracingRoot, distDir),
              SERVER_DIRECTORY,
              'app'
            ),
            { overwrite: true }
          )
        }
      }
    })
}

function getNumberOfWorkers(config: NextConfigComplete) {
  if (
    config.experimental.cpus &&
    config.experimental.cpus !== defaultConfig.experimental!.cpus
  ) {
    return config.experimental.cpus
  }

  if (config.experimental.memoryBasedWorkersCount) {
    return Math.max(
      Math.min(config.experimental.cpus || 1, Math.floor(os.freemem() / 1e9)),
      // enforce a minimum of 4 workers
      4
    )
  }

  if (config.experimental.cpus) {
    return config.experimental.cpus
  }

  // Fall back to 4 workers if a count is not specified
  return 4
}

const staticWorkerPath = require.resolve('./worker')
const staticWorkerExposedMethods = [
  'hasCustomGetInitialProps',
  'isPageStatic',
  'getDefinedNamedExports',
  'exportPages',
] as const
type StaticWorker = typeof import('./worker') & Worker
export function createStaticWorker(
  config: NextConfigComplete,
  progress?: {
    run: () => void
    clear: () => void
  }
): StaticWorker {
  // Get the node options without inspect and also remove the
  // --max-old-space-size flag as it can cause memory issues.
  const nodeOptions = getParsedNodeOptionsWithoutInspect()
  delete nodeOptions['max-old-space-size']
  delete nodeOptions['max_old_space_size']

  return new Worker(staticWorkerPath, {
    logger: Log,
    numWorkers: getNumberOfWorkers(config),
    onActivity: () => {
      progress?.run()
    },
    onActivityAbort: () => {
      progress?.clear()
    },
    forkOptions: {
      env: { ...process.env, NODE_OPTIONS: formatNodeOptions(nodeOptions) },
    },
    enableWorkerThreads: config.experimental.workerThreads,
    exposedMethods: staticWorkerExposedMethods,
  }) as StaticWorker
}

async function writeFullyStaticExport(
  config: NextConfigComplete,
  dir: string,
  enabledDirectories: NextEnabledDirectories,
  configOutDir: string,
  nextBuildSpan: Span
): Promise<void> {
  const exportApp = require('../export')
    .default as typeof import('../export').default

  const pagesWorker = createStaticWorker(config)
  const appWorker = createStaticWorker(config)

  await exportApp(
    dir,
    {
      buildExport: false,
      nextConfig: config,
      enabledDirectories,
      silent: true,
      outdir: path.join(dir, configOutDir),
      numWorkers: getNumberOfWorkers(config),
    },
    nextBuildSpan
  )

  pagesWorker.end()
  appWorker.end()
}

async function getBuildId(
  isGenerateMode: boolean,
  distDir: string,
  nextBuildSpan: Span,
  config: NextConfigComplete
) {
  if (isGenerateMode) {
    return await fs.readFile(path.join(distDir, 'BUILD_ID'), 'utf8')
  }
  return await nextBuildSpan
    .traceChild('generate-buildid')
    .traceAsyncFn(() => generateBuildId(config.generateBuildId, nanoid))
}

export default async function build(
  dir: string,
  reactProductionProfiling = false,
  debugOutput = false,
  runLint = true,
  noMangling = false,
  appDirOnly = false,
  turboNextBuild = false,
  experimentalBuildMode: 'default' | 'compile' | 'generate',
  traceUploadUrl: string | undefined
): Promise<void> {
  const isCompileMode = experimentalBuildMode === 'compile'
  const isGenerateMode = experimentalBuildMode === 'generate'

  let loadedConfig: NextConfigComplete | undefined
  try {
    const nextBuildSpan = trace('next-build', undefined, {
      buildMode: experimentalBuildMode,
      isTurboBuild: String(turboNextBuild),
      version: process.env.__NEXT_VERSION as string,
    })

    NextBuildContext.nextBuildSpan = nextBuildSpan
    NextBuildContext.dir = dir
    NextBuildContext.appDirOnly = appDirOnly
    NextBuildContext.reactProductionProfiling = reactProductionProfiling
    NextBuildContext.noMangling = noMangling

    await nextBuildSpan.traceAsyncFn(async () => {
      // attempt to load global env values so they are available in next.config.js
      const { loadedEnvFiles } = nextBuildSpan
        .traceChild('load-dotenv')
        .traceFn(() => loadEnvConfig(dir, false, Log))
      NextBuildContext.loadedEnvFiles = loadedEnvFiles

      const turborepoAccessTraceResult = new TurborepoAccessTraceResult()
      const config: NextConfigComplete = await nextBuildSpan
        .traceChild('load-next-config')
        .traceAsyncFn(() =>
          turborepoTraceAccess(
            () =>
              loadConfig(PHASE_PRODUCTION_BUILD, dir, {
                // Log for next.config loading process
                silent: false,
                reactProductionProfiling,
              }),
            turborepoAccessTraceResult
          )
        )
      loadedConfig = config

      process.env.NEXT_DEPLOYMENT_ID = config.deploymentId || ''
      NextBuildContext.config = config

      let configOutDir = 'out'
      if (hasCustomExportOutput(config)) {
        configOutDir = config.distDir
        config.distDir = '.next'
      }
      const distDir = path.join(dir, config.distDir)
      NextBuildContext.distDir = distDir
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      setGlobal('distDir', distDir)

      const buildId = await getBuildId(
        isGenerateMode,
        distDir,
        nextBuildSpan,
        config
      )
      NextBuildContext.buildId = buildId

      const customRoutes: CustomRoutes = await nextBuildSpan
        .traceChild('load-custom-routes')
        .traceAsyncFn(() => loadCustomRoutes(config))

      const { headers, rewrites, redirects } = customRoutes
      const combinedRewrites: Rewrite[] = [
        ...rewrites.beforeFiles,
        ...rewrites.afterFiles,
        ...rewrites.fallback,
      ]
      const hasRewrites = combinedRewrites.length > 0
      NextBuildContext.hasRewrites = hasRewrites
      NextBuildContext.originalRewrites = config._originalRewrites
      NextBuildContext.originalRedirects = config._originalRedirects

      const cacheDir = getCacheDir(distDir)

      const telemetry = new Telemetry({ distDir })

      setGlobal('telemetry', telemetry)

      const publicDir = path.join(dir, 'public')
      const { pagesDir, appDir } = findPagesDir(dir)
      NextBuildContext.pagesDir = pagesDir
      NextBuildContext.appDir = appDir

      const enabledDirectories: NextEnabledDirectories = {
        app: typeof appDir === 'string',
        pages: typeof pagesDir === 'string',
      }

      // Generate a random encryption key for this build.
      // This key is used to encrypt cross boundary values and can be used to generate hashes.
      const encryptionKey = await generateEncryptionKeyBase64({
        isBuild: true,
        distDir,
      })
      NextBuildContext.encryptionKey = encryptionKey

      const isSrcDir = path
        .relative(dir, pagesDir || appDir || '')
        .startsWith('src')
      const hasPublicDir = existsSync(publicDir)

      telemetry.record(
        eventCliSession(dir, config, {
          webpackVersion: 5,
          cliCommand: 'build',
          isSrcDir,
          hasNowJson: !!(await findUp('now.json', { cwd: dir })),
          isCustomServer: null,
          turboFlag: false,
          pagesDir: !!pagesDir,
          appDir: !!appDir,
        })
      )

      eventNextPlugins(path.resolve(dir)).then((events) =>
        telemetry.record(events)
      )

      eventSwcPlugins(path.resolve(dir), config).then((events) =>
        telemetry.record(events)
      )

      // Always log next version first then start rest jobs
      const { envInfo, experimentalFeatures } = await getStartServerInfo(
        dir,
        false
      )
      logStartInfo({
        networkUrl: null,
        appUrl: null,
        envInfo,
        experimentalFeatures,
      })

      const ignoreESLint = Boolean(config.eslint.ignoreDuringBuilds)
      const shouldLint = !ignoreESLint && runLint

      const typeCheckingOptions: Parameters<typeof startTypeChecking>[0] = {
        dir,
        appDir,
        pagesDir,
        runLint,
        shouldLint,
        ignoreESLint,
        telemetry,
        nextBuildSpan,
        config,
        cacheDir,
      }

      const distDirCreated = await nextBuildSpan
        .traceChild('create-dist-dir')
        .traceAsyncFn(async () => {
          try {
            await fs.mkdir(distDir, { recursive: true })
            return true
          } catch (err) {
            if (isError(err) && err.code === 'EPERM') {
              return false
            }
            throw err
          }
        })

      if (!distDirCreated || !(await isWriteable(distDir))) {
        throw new Error(
          '> Build directory is not writeable. https://nextjs.org/docs/messages/build-dir-not-writeable'
        )
      }

      if (config.cleanDistDir && !isGenerateMode) {
        await recursiveDelete(distDir, /^cache/)
      }

      // For app directory, we run type checking after build. That's because
      // we dynamically generate types for each layout and page in the app
      // directory.
      if (!appDir && !isCompileMode)
        await startTypeChecking(typeCheckingOptions)

      if (appDir && 'exportPathMap' in config) {
        Log.error(
          'The "exportPathMap" configuration cannot be used with the "app" directory. Please use generateStaticParams() instead.'
        )
        await telemetry.flush()
        process.exit(1)
      }

      const buildLintEvent: EventBuildFeatureUsage = {
        featureName: 'build-lint',
        invocationCount: shouldLint ? 1 : 0,
      }
      telemetry.record({
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: buildLintEvent,
      })

      const validFileMatcher = createValidFileMatcher(
        config.pageExtensions,
        appDir
      )

      const providedPagePaths: string[] = JSON.parse(
        process.env.NEXT_PRIVATE_PAGE_PATHS || '[]'
      )

      let pagesPaths = Boolean(process.env.NEXT_PRIVATE_PAGE_PATHS)
        ? providedPagePaths
        : !appDirOnly && pagesDir
          ? await nextBuildSpan.traceChild('collect-pages').traceAsyncFn(() =>
              recursiveReadDir(pagesDir, {
                pathnameFilter: validFileMatcher.isPageFile,
              })
            )
          : []

      const middlewareDetectionRegExp = new RegExp(
        `^${MIDDLEWARE_FILENAME}\\.(?:${config.pageExtensions.join('|')})$`
      )

      const instrumentationHookDetectionRegExp = new RegExp(
        `^${INSTRUMENTATION_HOOK_FILENAME}\\.(?:${config.pageExtensions.join(
          '|'
        )})$`
      )

      const rootDir = path.join((pagesDir || appDir)!, '..')
      const includes = [
        middlewareDetectionRegExp,
        instrumentationHookDetectionRegExp,
      ]

      const rootPaths = Array.from(await getFilesInDir(rootDir))
        .filter((file) => includes.some((include) => include.test(file)))
        .sort(sortByPageExts(config.pageExtensions))
        .map((file) => path.join(rootDir, file).replace(dir, ''))

      const hasInstrumentationHook = rootPaths.some((p) =>
        p.includes(INSTRUMENTATION_HOOK_FILENAME)
      )
      const hasMiddlewareFile = rootPaths.some((p) =>
        p.includes(MIDDLEWARE_FILENAME)
      )

      NextBuildContext.hasInstrumentationHook = hasInstrumentationHook

      const previewProps: __ApiPreviewProps = {
        previewModeId: crypto.randomBytes(16).toString('hex'),
        previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
        previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
      }
      NextBuildContext.previewProps = previewProps

      const mappedPages = await nextBuildSpan
        .traceChild('create-pages-mapping')
        .traceAsyncFn(() =>
          createPagesMapping({
            isDev: false,
            pageExtensions: config.pageExtensions,
            pagesType: PAGE_TYPES.PAGES,
            pagePaths: pagesPaths,
            pagesDir,
            appDir,
          })
        )
      NextBuildContext.mappedPages = mappedPages

      let mappedAppPages: MappedPages | undefined
      let denormalizedAppPages: string[] | undefined

      if (appDir) {
        const providedAppPaths: string[] = JSON.parse(
          process.env.NEXT_PRIVATE_APP_PATHS || '[]'
        )

        let appPaths = Boolean(process.env.NEXT_PRIVATE_APP_PATHS)
          ? providedAppPaths
          : await nextBuildSpan
              .traceChild('collect-app-paths')
              .traceAsyncFn(() =>
                recursiveReadDir(appDir, {
                  pathnameFilter: (absolutePath) =>
                    validFileMatcher.isAppRouterPage(absolutePath) ||
                    // For now we only collect the root /not-found page in the app
                    // directory as the 404 fallback
                    validFileMatcher.isRootNotFound(absolutePath),
                  ignorePartFilter: (part) => part.startsWith('_'),
                })
              )

        mappedAppPages = await nextBuildSpan
          .traceChild('create-app-mapping')
          .traceAsyncFn(() =>
            createPagesMapping({
              pagePaths: appPaths,
              isDev: false,
              pagesType: PAGE_TYPES.APP,
              pageExtensions: config.pageExtensions,
              pagesDir,
              appDir,
            })
          )

        NextBuildContext.mappedAppPages = mappedAppPages
      }

      const mappedRootPaths = await createPagesMapping({
        isDev: false,
        pageExtensions: config.pageExtensions,
        pagePaths: rootPaths,
        pagesType: PAGE_TYPES.ROOT,
        pagesDir: pagesDir,
        appDir,
      })
      NextBuildContext.mappedRootPaths = mappedRootPaths

      const pagesPageKeys = Object.keys(mappedPages)

      const conflictingAppPagePaths: [pagePath: string, appPath: string][] = []
      const appPageKeys = new Set<string>()
      if (mappedAppPages) {
        denormalizedAppPages = Object.keys(mappedAppPages)
        for (const appKey of denormalizedAppPages) {
          const normalizedAppPageKey = normalizeAppPath(appKey)
          const pagePath = mappedPages[normalizedAppPageKey]
          if (pagePath) {
            const appPath = mappedAppPages[appKey]
            conflictingAppPagePaths.push([
              pagePath.replace(/^private-next-pages/, 'pages'),
              appPath.replace(/^private-next-app-dir/, 'app'),
            ])
          }
          appPageKeys.add(normalizedAppPageKey)
        }
      }

      const appPaths = Array.from(appPageKeys)
      // Interception routes are modelled as beforeFiles rewrites
      rewrites.beforeFiles.push(
        ...generateInterceptionRoutesRewrites(appPaths, config.basePath)
      )

      NextBuildContext.rewrites = rewrites

      const totalAppPagesCount = appPaths.length

      const pageKeys = {
        pages: pagesPageKeys,
        app: appPaths.length > 0 ? appPaths : undefined,
      }

      // Turbopack already handles conflicting app and page routes.
      if (!turboNextBuild) {
        const numConflictingAppPaths = conflictingAppPagePaths.length
        if (mappedAppPages && numConflictingAppPaths > 0) {
          Log.error(
            `Conflicting app and page file${
              numConflictingAppPaths === 1 ? ' was' : 's were'
            } found, please remove the conflicting files to continue:`
          )
          for (const [pagePath, appPath] of conflictingAppPagePaths) {
            Log.error(`  "${pagePath}" - "${appPath}"`)
          }
          await telemetry.flush()
          process.exit(1)
        }
      }

      const conflictingPublicFiles: string[] = []
      const hasPages404 = mappedPages['/404']?.startsWith(PAGES_DIR_ALIAS)
      const hasApp404 = !!mappedAppPages?.[UNDERSCORE_NOT_FOUND_ROUTE_ENTRY]
      const hasCustomErrorPage =
        mappedPages['/_error'].startsWith(PAGES_DIR_ALIAS)

      if (hasPublicDir) {
        const hasPublicUnderScoreNextDir = existsSync(
          path.join(publicDir, '_next')
        )
        if (hasPublicUnderScoreNextDir) {
          throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
        }
      }

      await nextBuildSpan
        .traceChild('public-dir-conflict-check')
        .traceAsyncFn(async () => {
          // Check if pages conflict with files in `public`
          // Only a page of public file can be served, not both.
          for (const page in mappedPages) {
            const hasPublicPageFile = await fileExists(
              path.join(publicDir, page === '/' ? '/index' : page),
              FileType.File
            )
            if (hasPublicPageFile) {
              conflictingPublicFiles.push(page)
            }
          }

          const numConflicting = conflictingPublicFiles.length

          if (numConflicting) {
            throw new Error(
              `Conflicting public and page file${
                numConflicting === 1 ? ' was' : 's were'
              } found. https://nextjs.org/docs/messages/conflicting-public-file-page\n${conflictingPublicFiles.join(
                '\n'
              )}`
            )
          }
        })

      const nestedReservedPages = pageKeys.pages.filter((page) => {
        return (
          page.match(/\/(_app|_document|_error)$/) && path.dirname(page) !== '/'
        )
      })

      if (nestedReservedPages.length) {
        Log.warn(
          `The following reserved Next.js pages were detected not directly under the pages directory:\n` +
            nestedReservedPages.join('\n') +
            `\nSee more info here: https://nextjs.org/docs/messages/nested-reserved-page\n`
        )
      }

      const restrictedRedirectPaths = ['/_next'].map((p) =>
        config.basePath ? `${config.basePath}${p}` : p
      )

      const isAppDynamicIOEnabled = Boolean(config.experimental.dynamicIO)
      const isAuthInterruptsEnabled = Boolean(
        config.experimental.authInterrupts
      )
      const isAppPPREnabled = checkIsAppPPREnabled(config.experimental.ppr)

      const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
      const routesManifest: RoutesManifest = nextBuildSpan
        .traceChild('generate-routes-manifest')
        .traceFn(() => {
          const sortedRoutes = getSortedRoutes([
            ...pageKeys.pages,
            ...(pageKeys.app ?? []),
          ])
          const dynamicRoutes: Array<ReturnType<typeof pageToRoute>> = []
          const staticRoutes: typeof dynamicRoutes = []

          for (const route of sortedRoutes) {
            if (isDynamicRoute(route)) {
              dynamicRoutes.push(pageToRoute(route))
            } else if (!isReservedPage(route)) {
              staticRoutes.push(pageToRoute(route))
            }
          }

          return {
            version: 3,
            pages404: true,
            caseSensitive: !!config.experimental.caseSensitiveRoutes,
            basePath: config.basePath,
            redirects: redirects.map((r) =>
              buildCustomRoute('redirect', r, restrictedRedirectPaths)
            ),
            headers: headers.map((r) => buildCustomRoute('header', r)),
            dynamicRoutes,
            staticRoutes,
            dataRoutes: [],
            i18n: config.i18n || undefined,
            rsc: {
              header: RSC_HEADER,
              // This vary header is used as a default. It is technically re-assigned in `base-server`,
              // and may include an additional Vary option for `Next-URL`.
              varyHeader: `${RSC_HEADER}, ${NEXT_ROUTER_STATE_TREE_HEADER}, ${NEXT_ROUTER_PREFETCH_HEADER}, ${NEXT_ROUTER_SEGMENT_PREFETCH_HEADER}`,
              prefetchHeader: NEXT_ROUTER_PREFETCH_HEADER,
              didPostponeHeader: NEXT_DID_POSTPONE_HEADER,
              contentTypeHeader: RSC_CONTENT_TYPE_HEADER,
              suffix: RSC_SUFFIX,
              prefetchSuffix: RSC_PREFETCH_SUFFIX,
              prefetchSegmentHeader: NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
              prefetchSegmentSuffix: RSC_SEGMENT_SUFFIX,
              prefetchSegmentDirSuffix: RSC_SEGMENTS_DIR_SUFFIX,
            },
            rewriteHeaders: {
              pathHeader: NEXT_REWRITTEN_PATH_HEADER,
              queryHeader: NEXT_REWRITTEN_QUERY_HEADER,
            },
            skipMiddlewareUrlNormalize: config.skipMiddlewareUrlNormalize,
            ppr: isAppPPREnabled
              ? {
                  chain: {
                    headers: {
                      [NEXT_RESUME_HEADER]: '1',
                    },
                  },
                }
              : undefined,
          } satisfies RoutesManifest
        })

      if (rewrites.beforeFiles.length === 0 && rewrites.fallback.length === 0) {
        routesManifest.rewrites = rewrites.afterFiles.map((r) =>
          buildCustomRoute('rewrite', r)
        )
      } else {
        routesManifest.rewrites = {
          beforeFiles: rewrites.beforeFiles.map((r) =>
            buildCustomRoute('rewrite', r)
          ),
          afterFiles: rewrites.afterFiles.map((r) =>
            buildCustomRoute('rewrite', r)
          ),
          fallback: rewrites.fallback.map((r) =>
            buildCustomRoute('rewrite', r)
          ),
        }
      }
      let clientRouterFilters:
        | undefined
        | ReturnType<typeof createClientRouterFilter>

      if (config.experimental.clientRouterFilter) {
        const nonInternalRedirects = (config._originalRedirects || []).filter(
          (r: any) => !r.internal
        )
        clientRouterFilters = createClientRouterFilter(
          [...appPaths],
          config.experimental.clientRouterFilterRedirects
            ? nonInternalRedirects
            : [],
          config.experimental.clientRouterFilterAllowedRate
        )
        NextBuildContext.clientRouterFilters = clientRouterFilters
      }

      if (config.experimental.streamingMetadata) {
        // Write html limited bots config to response-config-manifest
        const responseConfigManifestPath = path.join(
          distDir,
          RESPONSE_CONFIG_MANIFEST
        )
        const responseConfigManifest: {
          version: number
          htmlLimitedBots: string
        } = {
          version: 0,
          htmlLimitedBots:
            config.experimental.htmlLimitedBots ||
            HTML_LIMITED_BOT_UA_RE_STRING,
        }
        await writeManifest(responseConfigManifestPath, responseConfigManifest)
      }

      // Ensure commonjs handling is used for files in the distDir (generally .next)
      // Files outside of the distDir can be "type": "module"
      await writeFileUtf8(
        path.join(distDir, 'package.json'),
        '{"type": "commonjs"}'
      )

      // These are written to distDir, so they need to come after creating and cleaning distDr.
      await recordFrameworkVersion(process.env.__NEXT_VERSION as string)
      await updateBuildDiagnostics({
        buildStage: 'start',
      })

      const outputFileTracingRoot = config.outputFileTracingRoot || dir

      const pagesManifestPath = path.join(
        distDir,
        SERVER_DIRECTORY,
        PAGES_MANIFEST
      )

      let buildTraceContext: undefined | BuildTraceContext
      let buildTracesPromise: Promise<any> | undefined = undefined

      // If there's has a custom webpack config and disable the build worker.
      // Otherwise respect the option if it's set.
      const useBuildWorker =
        config.experimental.webpackBuildWorker ||
        (config.experimental.webpackBuildWorker === undefined &&
          !config.webpack)
      const runServerAndEdgeInParallel =
        config.experimental.parallelServerCompiles
      const collectServerBuildTracesInParallel =
        config.experimental.parallelServerBuildTraces ||
        (config.experimental.parallelServerBuildTraces === undefined &&
          isCompileMode)

      nextBuildSpan.setAttribute(
        'has-custom-webpack-config',
        String(!!config.webpack)
      )
      nextBuildSpan.setAttribute('use-build-worker', String(useBuildWorker))

      if (
        !useBuildWorker &&
        (runServerAndEdgeInParallel || collectServerBuildTracesInParallel)
      ) {
        throw new Error(
          'The "parallelServerBuildTraces" and "parallelServerCompiles" options may only be used when build workers can be used. Read more: https://nextjs.org/docs/messages/parallel-build-without-worker'
        )
      }

      Log.info('Creating an optimized production build ...')
      traceMemoryUsage('Starting build', nextBuildSpan)

      await updateBuildDiagnostics({
        buildStage: 'compile',
        buildOptions: {
          useBuildWorker: String(useBuildWorker),
        },
      })

      let shutdownPromise = Promise.resolve()
      if (!isGenerateMode) {
        if (turboNextBuild) {
          const {
            duration: compilerDuration,
            shutdownPromise: p,
            ...rest
          } = await turbopackBuild(
            process.env.NEXT_TURBOPACK_USE_WORKER === undefined ||
              process.env.NEXT_TURBOPACK_USE_WORKER !== '0'
          )
          shutdownPromise = p
          traceMemoryUsage('Finished build', nextBuildSpan)

          buildTraceContext = rest.buildTraceContext

          let durationString
          if (compilerDuration > 120) {
            durationString = `${Math.round(compilerDuration / 6) / 10}min`
          } else if (compilerDuration > 20) {
            durationString = `${Math.round(compilerDuration)}s`
          } else if (compilerDuration > 2) {
            durationString = `${Math.round(compilerDuration * 10) / 10}s`
          } else {
            durationString = `${Math.round(compilerDuration * 1000)}ms`
          }
          Log.event(`Compiled successfully in ${durationString}`)

          telemetry.record(
            eventBuildCompleted(pagesPaths, {
              durationInSeconds: Math.round(compilerDuration),
              totalAppPagesCount,
            })
          )
        } else {
          if (
            runServerAndEdgeInParallel ||
            collectServerBuildTracesInParallel
          ) {
            let durationInSeconds = 0

            await updateBuildDiagnostics({
              buildStage: 'compile-server',
            })

            const serverBuildPromise = webpackBuild(useBuildWorker, [
              'server',
            ]).then((res) => {
              traceMemoryUsage('Finished server compilation', nextBuildSpan)
              buildTraceContext = res.buildTraceContext
              durationInSeconds += res.duration

              if (collectServerBuildTracesInParallel) {
                const buildTraceWorker = new Worker(
                  require.resolve('./collect-build-traces'),
                  {
                    numWorkers: 1,
                    exposedMethods: ['collectBuildTraces'],
                  }
                ) as Worker & typeof import('./collect-build-traces')

                buildTracesPromise = buildTraceWorker
                  .collectBuildTraces({
                    dir,
                    config,
                    distDir,
                    // Serialize Map as this is sent to the worker.
                    edgeRuntimeRoutes: collectRoutesUsingEdgeRuntime(new Map()),
                    staticPages: [],
                    hasSsrAmpPages: false,
                    buildTraceContext,
                    outputFileTracingRoot,
                  })
                  .catch((err) => {
                    console.error(err)
                    process.exit(1)
                  })
              }
            })
            if (!runServerAndEdgeInParallel) {
              await serverBuildPromise
              await updateBuildDiagnostics({
                buildStage: 'webpack-compile-edge-server',
              })
            }

            const edgeBuildPromise = webpackBuild(useBuildWorker, [
              'edge-server',
            ]).then((res) => {
              durationInSeconds += res.duration
              traceMemoryUsage(
                'Finished edge-server compilation',
                nextBuildSpan
              )
            })
            if (runServerAndEdgeInParallel) {
              await serverBuildPromise
              await updateBuildDiagnostics({
                buildStage: 'webpack-compile-edge-server',
              })
            }
            await edgeBuildPromise

            await updateBuildDiagnostics({
              buildStage: 'webpack-compile-client',
            })

            await webpackBuild(useBuildWorker, ['client']).then((res) => {
              durationInSeconds += res.duration
              traceMemoryUsage('Finished client compilation', nextBuildSpan)
            })

            Log.event('Compiled successfully')

            telemetry.record(
              eventBuildCompleted(pagesPaths, {
                durationInSeconds,
                totalAppPagesCount,
              })
            )
          } else {
            const { duration: compilerDuration, ...rest } = await webpackBuild(
              useBuildWorker,
              null
            )
            traceMemoryUsage('Finished build', nextBuildSpan)

            buildTraceContext = rest.buildTraceContext

            telemetry.record(
              eventBuildCompleted(pagesPaths, {
                durationInSeconds: compilerDuration,
                totalAppPagesCount,
              })
            )
          }
        }
      }

      // For app directory, we run type checking after build.
      if (appDir && !isCompileMode && !isGenerateMode) {
        await updateBuildDiagnostics({
          buildStage: 'type-checking',
        })
        await startTypeChecking(typeCheckingOptions)
        traceMemoryUsage('Finished type checking', nextBuildSpan)
      }

      const postCompileSpinner = createSpinner('Collecting page data')

      const buildManifestPath = path.join(distDir, BUILD_MANIFEST)
      const appBuildManifestPath = path.join(distDir, APP_BUILD_MANIFEST)

      let staticAppPagesCount = 0
      let serverAppPagesCount = 0
      let edgeRuntimeAppCount = 0
      let edgeRuntimePagesCount = 0
      const ssgPages = new Set<string>()
      const ssgStaticFallbackPages = new Set<string>()
      const ssgBlockingFallbackPages = new Set<string>()
      const staticPages = new Set<string>()
      const invalidPages = new Set<string>()
      const hybridAmpPages = new Set<string>()
      const serverPropsPages = new Set<string>()
      const additionalPaths = new Map<string, PrerenderedRoute[]>()
      const staticPaths = new Map<string, PrerenderedRoute[]>()
      const prospectiveRenders = new Map<
        string,
        { page: string; originalAppPath: string }
      >()
      const appNormalizedPaths = new Map<string, string>()
      const fallbackModes = new Map<string, FallbackMode>()
      const appDefaultConfigs = new Map<string, AppSegmentConfig>()
      const pageInfos: PageInfos = new Map<string, PageInfo>()
      let pagesManifest = await readManifest<PagesManifest>(pagesManifestPath)
      const buildManifest = await readManifest<BuildManifest>(buildManifestPath)
      const appBuildManifest = appDir
        ? await readManifest<AppBuildManifest>(appBuildManifestPath)
        : undefined

      const appPathRoutes: Record<string, string> = {}

      if (appDir) {
        const appPathsManifest = await readManifest<Record<string, string>>(
          path.join(distDir, SERVER_DIRECTORY, APP_PATHS_MANIFEST)
        )

        for (const key in appPathsManifest) {
          appPathRoutes[key] = normalizeAppPath(key)
        }

        await writeManifest(
          path.join(distDir, APP_PATH_ROUTES_MANIFEST),
          appPathRoutes
        )
      }

      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

      const worker = createStaticWorker(config)

      const analysisBegin = process.hrtime()
      const staticCheckSpan = nextBuildSpan.traceChild('static-check')

      const functionsConfigManifest: FunctionsConfigManifest = {
        version: 1,
        functions: {},
      }

      const {
        customAppGetInitialProps,
        namedExports,
        isNextImageImported,
        hasSsrAmpPages,
        hasNonStaticErrorPage,
      } = await staticCheckSpan.traceAsyncFn(async () => {
        if (isCompileMode) {
          return {
            customAppGetInitialProps: false,
            namedExports: [],
            isNextImageImported: true,
            hasSsrAmpPages: !!pagesDir,
            hasNonStaticErrorPage: true,
          }
        }

        const { configFileName, publicRuntimeConfig, serverRuntimeConfig } =
          config
        const runtimeEnvConfig = { publicRuntimeConfig, serverRuntimeConfig }
        const sriEnabled = Boolean(config.experimental.sri?.algorithm)

        const nonStaticErrorPageSpan = staticCheckSpan.traceChild(
          'check-static-error-page'
        )
        const errorPageHasCustomGetInitialProps =
          nonStaticErrorPageSpan.traceAsyncFn(
            async () =>
              hasCustomErrorPage &&
              (await worker.hasCustomGetInitialProps({
                page: '/_error',
                distDir,
                runtimeEnvConfig,
                checkingApp: false,
                sriEnabled,
              }))
          )

        const errorPageStaticResult = nonStaticErrorPageSpan.traceAsyncFn(
          async () =>
            hasCustomErrorPage &&
            worker.isPageStatic({
              dir,
              page: '/_error',
              distDir,
              configFileName,
              runtimeEnvConfig,
              dynamicIO: isAppDynamicIOEnabled,
              authInterrupts: isAuthInterruptsEnabled,
              httpAgentOptions: config.httpAgentOptions,
              locales: config.i18n?.locales,
              defaultLocale: config.i18n?.defaultLocale,
              nextConfigOutput: config.output,
              pprConfig: config.experimental.ppr,
              cacheLifeProfiles: config.experimental.cacheLife,
              buildId,
              sriEnabled,
            })
        )

        const appPageToCheck = '/_app'

        const customAppGetInitialPropsPromise = worker.hasCustomGetInitialProps(
          {
            page: appPageToCheck,
            distDir,
            runtimeEnvConfig,
            checkingApp: true,
            sriEnabled,
          }
        )

        const namedExportsPromise = worker.getDefinedNamedExports({
          page: appPageToCheck,
          distDir,
          runtimeEnvConfig,
          sriEnabled,
        })

        // eslint-disable-next-line @typescript-eslint/no-shadow
        let isNextImageImported: boolean | undefined
        // eslint-disable-next-line @typescript-eslint/no-shadow
        let hasSsrAmpPages = false

        const computedManifestData = await computeFromManifest(
          { build: buildManifest, app: appBuildManifest },
          distDir,
          config.experimental.gzipSize
        )

        const middlewareManifest: MiddlewareManifest = require(
          path.join(distDir, SERVER_DIRECTORY, MIDDLEWARE_MANIFEST)
        )

        const actionManifest = appDir
          ? (require(
              path.join(
                distDir,
                SERVER_DIRECTORY,
                SERVER_REFERENCE_MANIFEST + '.json'
              )
            ) as ActionManifest)
          : null
        const entriesWithAction = actionManifest ? new Set() : null
        if (actionManifest && entriesWithAction) {
          for (const id in actionManifest.node) {
            for (const entry in actionManifest.node[id].workers) {
              entriesWithAction.add(entry)
            }
          }
          for (const id in actionManifest.edge) {
            for (const entry in actionManifest.edge[id].workers) {
              entriesWithAction.add(entry)
            }
          }
        }

        for (const key of Object.keys(middlewareManifest?.functions)) {
          if (key.startsWith('/api')) {
            edgeRuntimePagesCount++
          }
        }

        await Promise.all(
          Object.entries(pageKeys)
            .reduce<Array<{ pageType: keyof typeof pageKeys; page: string }>>(
              (acc, [key, files]) => {
                if (!files) {
                  return acc
                }

                const pageType = key as keyof typeof pageKeys

                for (const page of files) {
                  acc.push({ pageType, page })
                }

                return acc
              },
              []
            )
            .map(({ pageType, page }) => {
              const checkPageSpan = staticCheckSpan.traceChild('check-page', {
                page,
              })
              return checkPageSpan.traceAsyncFn(async () => {
                const actualPage = normalizePagePath(page)
                const [size, totalSize] = await getJsPageSizeInKb(
                  pageType,
                  actualPage,
                  distDir,
                  buildManifest,
                  appBuildManifest,
                  config.experimental.gzipSize,
                  computedManifestData
                )

                let isRoutePPREnabled = false
                let isSSG = false
                let isStatic = false
                let isServerComponent = false
                let isHybridAmp = false
                let ssgPageRoutes: string[] | null = null
                let pagePath = ''

                if (pageType === 'pages') {
                  pagePath =
                    pagesPaths.find((p) => {
                      p = normalizePathSep(p)
                      return (
                        p.startsWith(actualPage + '.') ||
                        p.startsWith(actualPage + '/index.')
                      )
                    }) || ''
                }
                let originalAppPath: string | undefined

                if (pageType === 'app' && mappedAppPages) {
                  for (const [originalPath, normalizedPath] of Object.entries(
                    appPathRoutes
                  )) {
                    if (normalizedPath === page) {
                      pagePath = mappedAppPages[originalPath].replace(
                        /^private-next-app-dir/,
                        ''
                      )
                      originalAppPath = originalPath
                      break
                    }
                  }
                }

                const pageFilePath = isAppBuiltinNotFoundPage(pagePath)
                  ? require.resolve(
                      'next/dist/client/components/not-found-error'
                    )
                  : path.join(
                      (pageType === 'pages' ? pagesDir : appDir) || '',
                      pagePath
                    )

                const isInsideAppDir = pageType === 'app'
                const staticInfo = pagePath
                  ? await getStaticInfoIncludingLayouts({
                      isInsideAppDir,
                      pageFilePath,
                      pageExtensions: config.pageExtensions,
                      appDir,
                      config,
                      isDev: false,
                      // If this route is an App Router page route, inherit the
                      // route segment configs (e.g. `runtime`) from the layout by
                      // passing the `originalAppPath`, which should end with `/page`.
                      page: isInsideAppDir ? originalAppPath! : page,
                    })
                  : undefined

                // If there's any thing that would contribute to the functions
                // configuration, we need to add it to the manifest.
                if (
                  typeof staticInfo?.runtime !== 'undefined' ||
                  typeof staticInfo?.maxDuration !== 'undefined'
                ) {
                  functionsConfigManifest.functions[page] = {
                    maxDuration: staticInfo?.maxDuration,
                  }
                }

                const pageRuntime = middlewareManifest.functions[
                  originalAppPath || page
                ]
                  ? 'edge'
                  : staticInfo?.runtime

                if (!isCompileMode) {
                  isServerComponent =
                    pageType === 'app' &&
                    staticInfo?.rsc !== RSC_MODULE_TYPES.client

                  if (pageType === 'app' || !isReservedPage(page)) {
                    try {
                      let edgeInfo: any

                      if (isEdgeRuntime(pageRuntime)) {
                        if (pageType === 'app') {
                          edgeRuntimeAppCount++
                        } else {
                          edgeRuntimePagesCount++
                        }

                        const manifestKey =
                          pageType === 'pages' ? page : originalAppPath || ''

                        edgeInfo = middlewareManifest.functions[manifestKey]
                      }

                      let isPageStaticSpan =
                        checkPageSpan.traceChild('is-page-static')
                      let workerResult = await isPageStaticSpan.traceAsyncFn(
                        () => {
                          return worker.isPageStatic({
                            dir,
                            page,
                            originalAppPath,
                            distDir,
                            configFileName,
                            runtimeEnvConfig,
                            httpAgentOptions: config.httpAgentOptions,
                            locales: config.i18n?.locales,
                            defaultLocale: config.i18n?.defaultLocale,
                            parentId: isPageStaticSpan.getId(),
                            pageRuntime,
                            edgeInfo,
                            pageType,
                            dynamicIO: isAppDynamicIOEnabled,
                            authInterrupts: isAuthInterruptsEnabled,
                            cacheHandler: config.cacheHandler,
                            cacheHandlers: config.experimental.cacheHandlers,
                            isrFlushToDisk: ciEnvironment.hasNextSupport
                              ? false
                              : config.experimental.isrFlushToDisk,
                            maxMemoryCacheSize: config.cacheMaxMemorySize,
                            nextConfigOutput: config.output,
                            pprConfig: config.experimental.ppr,
                            cacheLifeProfiles: config.experimental.cacheLife,
                            buildId,
                            sriEnabled,
                          })
                        }
                      )

                      if (pageType === 'app' && originalAppPath) {
                        appNormalizedPaths.set(originalAppPath, page)
                        // TODO-APP: handle prerendering with edge
                        if (isEdgeRuntime(pageRuntime)) {
                          isStatic = false
                          isSSG = false

                          Log.warnOnce(
                            `Using edge runtime on a page currently disables static generation for that page`
                          )
                        } else {
                          const isDynamic = isDynamicRoute(page)

                          if (
                            typeof workerResult.isRoutePPREnabled === 'boolean'
                          ) {
                            isRoutePPREnabled = workerResult.isRoutePPREnabled
                          }

                          // If this route can be partially pre-rendered, then
                          // mark it as such and mark that it can be
                          // generated server-side.
                          if (workerResult.isRoutePPREnabled) {
                            isSSG = true
                            isStatic = true

                            staticPaths.set(originalAppPath, [])
                          }
                          // As PPR isn't enabled for this route, if dynamic IO
                          // is enabled, and this is a dynamic route, we should
                          // complete a prospective render for the route so that
                          // we can use the fallback behavior. This lets us
                          // check that dynamic pages won't error when they
                          // enable PPR.
                          else if (config.experimental.dynamicIO && isDynamic) {
                            prospectiveRenders.set(originalAppPath, {
                              page,
                              originalAppPath,
                            })
                          }

                          if (workerResult.prerenderedRoutes) {
                            staticPaths.set(
                              originalAppPath,
                              workerResult.prerenderedRoutes
                            )
                            ssgPageRoutes = workerResult.prerenderedRoutes.map(
                              (route) => route.pathname
                            )
                            isSSG = true
                          }

                          const appConfig = workerResult.appConfig || {}
                          if (appConfig.revalidate !== 0) {
                            const hasGenerateStaticParams =
                              workerResult.prerenderedRoutes &&
                              workerResult.prerenderedRoutes.length > 0

                            if (
                              config.output === 'export' &&
                              isDynamic &&
                              !hasGenerateStaticParams
                            ) {
                              throw new Error(
                                `Page "${page}" is missing "generateStaticParams()" so it cannot be used with "output: export" config.`
                              )
                            }

                            // Mark the app as static if:
                            // - It has no dynamic param
                            // - It doesn't have generateStaticParams but `dynamic` is set to
                            //   `error` or `force-static`
                            if (!isDynamic) {
                              staticPaths.set(originalAppPath, [
                                {
                                  pathname: page,
                                  encodedPathname: page,
                                  fallbackRouteParams: undefined,
                                  fallbackMode:
                                    workerResult.prerenderFallbackMode,
                                  fallbackRootParams: undefined,
                                },
                              ])
                              isStatic = true
                            } else if (
                              !hasGenerateStaticParams &&
                              (appConfig.dynamic === 'error' ||
                                appConfig.dynamic === 'force-static')
                            ) {
                              staticPaths.set(originalAppPath, [])
                              isStatic = true
                              isRoutePPREnabled = false
                            }
                          }

                          if (workerResult.prerenderFallbackMode) {
                            fallbackModes.set(
                              originalAppPath,
                              workerResult.prerenderFallbackMode
                            )
                          }

                          appDefaultConfigs.set(originalAppPath, appConfig)
                        }
                      } else {
                        if (isEdgeRuntime(pageRuntime)) {
                          if (workerResult.hasStaticProps) {
                            console.warn(
                              `"getStaticProps" is not yet supported fully with "experimental-edge", detected on ${page}`
                            )
                          }
                          // TODO: add handling for statically rendering edge
                          // pages and allow edge with Prerender outputs
                          workerResult.isStatic = false
                          workerResult.hasStaticProps = false
                        }

                        if (
                          workerResult.isStatic === false &&
                          (workerResult.isHybridAmp || workerResult.isAmpOnly)
                        ) {
                          hasSsrAmpPages = true
                        }

                        if (workerResult.isHybridAmp) {
                          isHybridAmp = true
                          hybridAmpPages.add(page)
                        }

                        if (workerResult.isNextImageImported) {
                          isNextImageImported = true
                        }

                        if (workerResult.hasStaticProps) {
                          ssgPages.add(page)
                          isSSG = true

                          if (
                            workerResult.prerenderedRoutes &&
                            workerResult.prerenderedRoutes.length > 0
                          ) {
                            additionalPaths.set(
                              page,
                              workerResult.prerenderedRoutes
                            )
                            ssgPageRoutes = workerResult.prerenderedRoutes.map(
                              (route) => route.pathname
                            )
                          }

                          if (
                            workerResult.prerenderFallbackMode ===
                            FallbackMode.BLOCKING_STATIC_RENDER
                          ) {
                            ssgBlockingFallbackPages.add(page)
                          } else if (
                            workerResult.prerenderFallbackMode ===
                            FallbackMode.PRERENDER
                          ) {
                            ssgStaticFallbackPages.add(page)
                          }
                        } else if (workerResult.hasServerProps) {
                          serverPropsPages.add(page)
                        } else if (
                          workerResult.isStatic &&
                          !isServerComponent &&
                          (await customAppGetInitialPropsPromise) === false
                        ) {
                          staticPages.add(page)
                          isStatic = true
                        } else if (isServerComponent) {
                          // This is a static server component page that doesn't have
                          // gSP or gSSP. We still treat it as a SSG page.
                          ssgPages.add(page)
                          isSSG = true
                        }

                        if (hasPages404 && page === '/404') {
                          if (
                            !workerResult.isStatic &&
                            !workerResult.hasStaticProps
                          ) {
                            throw new Error(
                              `\`pages/404\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
                            )
                          }
                          // we need to ensure the 404 lambda is present since we use
                          // it when _app has getInitialProps
                          if (
                            (await customAppGetInitialPropsPromise) &&
                            !workerResult.hasStaticProps
                          ) {
                            staticPages.delete(page)
                          }
                        }

                        if (
                          STATIC_STATUS_PAGES.includes(page) &&
                          !workerResult.isStatic &&
                          !workerResult.hasStaticProps
                        ) {
                          throw new Error(
                            `\`pages${page}\` ${STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR}`
                          )
                        }
                      }
                    } catch (err) {
                      if (
                        !isError(err) ||
                        err.message !== 'INVALID_DEFAULT_EXPORT'
                      )
                        throw err
                      invalidPages.add(page)
                    }
                  }

                  if (pageType === 'app') {
                    if (isSSG || isStatic) {
                      staticAppPagesCount++
                    } else {
                      serverAppPagesCount++
                    }
                  }
                }

                pageInfos.set(page, {
                  size,
                  totalSize,
                  isStatic,
                  isSSG,
                  isRoutePPREnabled,
                  isHybridAmp,
                  ssgPageRoutes,
                  initialRevalidateSeconds: false,
                  runtime: pageRuntime,
                  pageDuration: undefined,
                  ssgPageDurations: undefined,
                  hasEmptyPrelude: undefined,
                })
              })
            })
        )

        if (hadUnsupportedValue) {
          Log.error(
            `Invalid config value exports detected, these can cause unexpected behavior from the configs not being applied. Please fix them to continue`
          )
          process.exit(1)
        }

        const errorPageResult = await errorPageStaticResult
        const nonStaticErrorPage =
          (await errorPageHasCustomGetInitialProps) ||
          (errorPageResult && errorPageResult.hasServerProps)

        const returnValue = {
          customAppGetInitialProps: await customAppGetInitialPropsPromise,
          namedExports: await namedExportsPromise,
          isNextImageImported,
          hasSsrAmpPages,
          hasNonStaticErrorPage: nonStaticErrorPage,
        }

        return returnValue
      })

      if (postCompileSpinner) postCompileSpinner.stopAndPersist()
      traceMemoryUsage('Finished collecting page data', nextBuildSpan)

      if (customAppGetInitialProps) {
        console.warn(
          bold(yellow(`Warning: `)) +
            yellow(
              `You have opted-out of Automatic Static Optimization due to \`getInitialProps\` in \`pages/_app\`. This does not opt-out pages with \`getStaticProps\``
            )
        )
        console.warn(
          'Read more: https://nextjs.org/docs/messages/opt-out-auto-static-optimization\n'
        )
      }

      const { cacheHandler } = config

      const instrumentationHookEntryFiles: string[] = []
      if (hasInstrumentationHook) {
        instrumentationHookEntryFiles.push(
          path.join(SERVER_DIRECTORY, `${INSTRUMENTATION_HOOK_FILENAME}.js`)
        )
        // If there's edge routes, append the edge instrumentation hook
        // Turbopack generates this chunk with a hashed name and references it in middleware-manifest.
        if (
          !process.env.TURBOPACK &&
          (edgeRuntimeAppCount || edgeRuntimePagesCount)
        ) {
          instrumentationHookEntryFiles.push(
            path.join(
              SERVER_DIRECTORY,
              `edge-${INSTRUMENTATION_HOOK_FILENAME}.js`
            )
          )
        }
      }

      const requiredServerFilesManifest = nextBuildSpan
        .traceChild('generate-required-server-files')
        .traceFn(() => {
          const normalizedCacheHandlers: Record<string, string> = {}

          for (const [key, value] of Object.entries(
            config.experimental.cacheHandlers || {}
          )) {
            if (key && value) {
              normalizedCacheHandlers[key] = path.relative(distDir, value)
            }
          }

          const serverFilesManifest: RequiredServerFilesManifest = {
            version: 1,
            config: {
              ...config,
              configFile: undefined,
              ...(ciEnvironment.hasNextSupport
                ? {
                    compress: false,
                  }
                : {}),
              cacheHandler: cacheHandler
                ? path.relative(distDir, cacheHandler)
                : config.cacheHandler,
              experimental: {
                ...config.experimental,
                cacheHandlers: normalizedCacheHandlers,
                trustHostHeader: ciEnvironment.hasNextSupport,

                // @ts-expect-error internal field TODO: fix this, should use a separate mechanism to pass the info.
                isExperimentalCompile: isCompileMode,
              },
            },
            appDir: dir,
            relativeAppDir: path.relative(outputFileTracingRoot, dir),
            files: [
              ROUTES_MANIFEST,
              path.relative(distDir, pagesManifestPath),
              BUILD_MANIFEST,
              PRERENDER_MANIFEST,
              path.join(SERVER_DIRECTORY, FUNCTIONS_CONFIG_MANIFEST),
              path.join(SERVER_DIRECTORY, MIDDLEWARE_MANIFEST),
              path.join(SERVER_DIRECTORY, MIDDLEWARE_BUILD_MANIFEST + '.js'),
              ...(config.experimental.streamingMetadata
                ? [RESPONSE_CONFIG_MANIFEST]
                : []),
              ...(!process.env.TURBOPACK
                ? [
                    path.join(
                      SERVER_DIRECTORY,
                      MIDDLEWARE_REACT_LOADABLE_MANIFEST + '.js'
                    ),
                    REACT_LOADABLE_MANIFEST,
                  ]
                : []),
              ...(appDir
                ? [
                    ...(config.experimental.sri
                      ? [
                          path.join(
                            SERVER_DIRECTORY,
                            SUBRESOURCE_INTEGRITY_MANIFEST + '.js'
                          ),
                          path.join(
                            SERVER_DIRECTORY,
                            SUBRESOURCE_INTEGRITY_MANIFEST + '.json'
                          ),
                        ]
                      : []),
                    path.join(SERVER_DIRECTORY, APP_PATHS_MANIFEST),
                    path.join(APP_PATH_ROUTES_MANIFEST),
                    APP_BUILD_MANIFEST,
                    path.join(
                      SERVER_DIRECTORY,
                      SERVER_REFERENCE_MANIFEST + '.js'
                    ),
                    path.join(
                      SERVER_DIRECTORY,
                      SERVER_REFERENCE_MANIFEST + '.json'
                    ),
                  ]
                : []),
              ...(pagesDir && !turboNextBuild
                ? [
                    DYNAMIC_CSS_MANIFEST + '.json',
                    path.join(SERVER_DIRECTORY, DYNAMIC_CSS_MANIFEST + '.js'),
                  ]
                : []),
              BUILD_ID_FILE,
              path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.js'),
              path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.json'),
              ...instrumentationHookEntryFiles,
            ]
              .filter(nonNullable)
              .map((file) => path.join(config.distDir, file)),
            ignore: [] as string[],
          }

          return serverFilesManifest
        })

      if (!hasSsrAmpPages) {
        requiredServerFilesManifest.ignore.push(
          path.relative(
            dir,
            path.join(
              path.dirname(
                require.resolve(
                  'next/dist/compiled/@ampproject/toolbox-optimizer'
                )
              ),
              '**/*'
            )
          )
        )
      }

      const middlewareFile = rootPaths.find((p) =>
        p.includes(MIDDLEWARE_FILENAME)
      )
      let hasNodeMiddleware = false

      if (middlewareFile) {
        const staticInfo = await getStaticInfoIncludingLayouts({
          isInsideAppDir: false,
          pageFilePath: path.join(dir, middlewareFile),
          config,
          appDir,
          pageExtensions: config.pageExtensions,
          isDev: false,
          page: 'middleware',
        })

        if (staticInfo.runtime === 'nodejs') {
          hasNodeMiddleware = true
          functionsConfigManifest.functions['/_middleware'] = {
            runtime: staticInfo.runtime,
            matchers: staticInfo.middleware?.matchers ?? [
              {
                regexp: '^.*$',
                originalSource: '/:path*',
              },
            ],
          }
        }
      }

      await writeFunctionsConfigManifest(distDir, functionsConfigManifest)

      if (!isGenerateMode && !buildTracesPromise) {
        buildTracesPromise = collectBuildTraces({
          dir,
          config,
          distDir,
          edgeRuntimeRoutes: collectRoutesUsingEdgeRuntime(pageInfos),
          staticPages: [...staticPages],
          nextBuildSpan,
          hasSsrAmpPages,
          buildTraceContext,
          outputFileTracingRoot,
        }).catch((err) => {
          console.error(err)
          process.exit(1)
        })
      }

      if (serverPropsPages.size > 0 || ssgPages.size > 0) {
        // We update the routes manifest after the build with the
        // data routes since we can't determine these until after build
        routesManifest.dataRoutes = getSortedRoutes([
          ...serverPropsPages,
          ...ssgPages,
        ]).map((page) => {
          return buildDataRoute(page, buildId)
        })
      }

      // We need to write the manifest with rewrites before build
      await nextBuildSpan
        .traceChild('write-routes-manifest')
        .traceAsyncFn(() => writeManifest(routesManifestPath, routesManifest))

      // Since custom _app.js can wrap the 404 page we have to opt-out of static optimization if it has getInitialProps
      // Only export the static 404 when there is no /_error present
      const useStaticPages404 =
        !customAppGetInitialProps && (!hasNonStaticErrorPage || hasPages404)

      if (invalidPages.size > 0) {
        const err = new Error(
          `Build optimization failed: found page${
            invalidPages.size === 1 ? '' : 's'
          } without a React Component as default export in \n${[...invalidPages]
            .map((pg) => `pages${pg}`)
            .join(
              '\n'
            )}\n\nSee https://nextjs.org/docs/messages/page-without-valid-component for more info.\n`
        ) as NextError
        err.code = 'BUILD_OPTIMIZATION_FAILED'
        throw err
      }

      await writeBuildId(distDir, buildId)

      if (config.experimental.optimizeCss) {
        const globOrig =
          require('next/dist/compiled/glob') as typeof import('next/dist/compiled/glob')

        const cssFilePaths = await new Promise<string[]>((resolve, reject) => {
          globOrig(
            '**/*.css',
            { cwd: path.join(distDir, 'static') },
            (err, files) => {
              if (err) {
                return reject(err)
              }
              resolve(files)
            }
          )
        })

        requiredServerFilesManifest.files.push(
          ...cssFilePaths.map((filePath) =>
            path.join(config.distDir, 'static', filePath)
          )
        )
      }

      const features: EventBuildFeatureUsage[] = [
        {
          featureName: 'experimental/dynamicIO',
          invocationCount: config.experimental.dynamicIO ? 1 : 0,
        },
        {
          featureName: 'experimental/optimizeCss',
          invocationCount: config.experimental.optimizeCss ? 1 : 0,
        },
        {
          featureName: 'experimental/nextScriptWorkers',
          invocationCount: config.experimental.nextScriptWorkers ? 1 : 0,
        },
        {
          featureName: 'experimental/ppr',
          invocationCount: config.experimental.ppr ? 1 : 0,
        },
      ]
      telemetry.record(
        features.map((feature) => {
          return {
            eventName: EVENT_BUILD_FEATURE_USAGE,
            payload: feature,
          }
        })
      )

      await writeRequiredServerFilesManifest(
        distDir,
        requiredServerFilesManifest
      )

      const middlewareManifest: MiddlewareManifest = await readManifest(
        path.join(distDir, SERVER_DIRECTORY, MIDDLEWARE_MANIFEST)
      )

      const prerenderManifest: PrerenderManifest = {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: previewProps,
      }

      const tbdPrerenderRoutes: string[] = []

      const { i18n } = config

      const usedStaticStatusPages = STATIC_STATUS_PAGES.filter(
        (page) =>
          mappedPages[page] &&
          mappedPages[page].startsWith('private-next-pages')
      )
      usedStaticStatusPages.forEach((page) => {
        if (!ssgPages.has(page) && !customAppGetInitialProps) {
          staticPages.add(page)
        }
      })

      const hasPages500 = usedStaticStatusPages.includes('/500')
      const useDefaultStatic500 =
        !hasPages500 && !hasNonStaticErrorPage && !customAppGetInitialProps

      const combinedPages = [...staticPages, ...ssgPages]
      const isApp404Static = staticPaths.has(UNDERSCORE_NOT_FOUND_ROUTE_ENTRY)
      const hasStaticApp404 = hasApp404 && isApp404Static

      await updateBuildDiagnostics({
        buildStage: 'static-generation',
      })

      // we need to trigger automatic exporting when we have
      // - static 404/500
      // - getStaticProps paths
      // - experimental app is enabled
      if (
        !isCompileMode &&
        (combinedPages.length > 0 ||
          useStaticPages404 ||
          useDefaultStatic500 ||
          appDir)
      ) {
        const staticGenerationSpan =
          nextBuildSpan.traceChild('static-generation')
        await staticGenerationSpan.traceAsyncFn(async () => {
          detectConflictingPaths(
            [
              ...combinedPages,
              ...pageKeys.pages.filter((page) => !combinedPages.includes(page)),
            ],
            ssgPages,
            new Map(
              Array.from(additionalPaths.entries()).map(
                ([page, routes]): [string, string[]] => {
                  return [page, routes.map((route) => route.pathname)]
                }
              )
            )
          )
          const exportApp = require('../export')
            .default as typeof import('../export').default

          const exportConfig: NextConfigComplete = {
            ...config,
            // Default map will be the collection of automatic statically exported
            // pages and incremental pages.
            // n.b. we cannot handle this above in combinedPages because the dynamic
            // page must be in the `pages` array, but not in the mapping.
            exportPathMap: (defaultMap: ExportPathMap) => {
              // Dynamically routed pages should be prerendered to be used as
              // a client-side skeleton (fallback) while data is being fetched.
              // This ensures the end-user never sees a 500 or slow response from the
              // server.
              //
              // Note: prerendering disables automatic static optimization.
              ssgPages.forEach((page) => {
                if (isDynamicRoute(page)) {
                  tbdPrerenderRoutes.push(page)

                  if (ssgStaticFallbackPages.has(page)) {
                    // Override the rendering for the dynamic page to be treated as a
                    // fallback render.
                    if (i18n) {
                      defaultMap[`/${i18n.defaultLocale}${page}`] = {
                        page,
                        _pagesFallback: true,
                      }
                    } else {
                      defaultMap[page] = {
                        page,
                        _pagesFallback: true,
                      }
                    }
                  } else {
                    // Remove dynamically routed pages from the default path map when
                    // fallback behavior is disabled.
                    delete defaultMap[page]
                  }
                }
              })

              // Append the "well-known" routes we should prerender for, e.g. blog
              // post slugs.
              additionalPaths.forEach((routes, page) => {
                routes.forEach((route) => {
                  defaultMap[route.pathname] = {
                    page,
                    _ssgPath: route.encodedPathname,
                  }
                })
              })

              if (useStaticPages404) {
                defaultMap['/404'] = {
                  page: hasPages404 ? '/404' : '/_error',
                }
              }

              if (useDefaultStatic500) {
                defaultMap['/500'] = {
                  page: '/_error',
                }
              }

              // TODO: output manifest specific to app paths and their
              // revalidate periods and dynamicParams settings
              staticPaths.forEach((routes, originalAppPath) => {
                const appConfig = appDefaultConfigs.get(originalAppPath)
                const isDynamicError = appConfig?.dynamic === 'error'

                const isRoutePPREnabled = appConfig
                  ? checkIsRoutePPREnabled(config.experimental.ppr, appConfig)
                  : undefined

                routes.forEach((route) => {
                  // If the route has any dynamic root segments, we need to skip
                  // rendering the route. This is because we don't support
                  // revalidating the shells without the parameters present.
                  if (
                    route.fallbackRootParams &&
                    route.fallbackRootParams.length > 0
                  ) {
                    return
                  }

                  defaultMap[route.pathname] = {
                    page: originalAppPath,
                    _ssgPath: route.encodedPathname,
                    _fallbackRouteParams: route.fallbackRouteParams,
                    _isDynamicError: isDynamicError,
                    _isAppDir: true,
                    _isRoutePPREnabled: isRoutePPREnabled,
                  }
                })
              })

              // If the app does have dynamic IO enabled but does not have PPR
              // enabled, then we need to perform a prospective render for all
              // the dynamic pages to ensure that they won't error during
              // rendering (due to a missing prelude).
              for (const {
                page,
                originalAppPath,
              } of prospectiveRenders.values()) {
                defaultMap[page] = {
                  page: originalAppPath,
                  _ssgPath: page,
                  _fallbackRouteParams: getParamKeys(page),
                  // Prospective renders are only enabled for app pages.
                  _isAppDir: true,
                  // Prospective renders are only enabled when PPR is disabled.
                  _isRoutePPREnabled: false,
                  _isProspectiveRender: true,
                  // Dynamic IO does not currently support `dynamic === 'error'`.
                  _isDynamicError: false,
                }
              }

              if (i18n) {
                for (const page of [
                  ...staticPages,
                  ...ssgPages,
                  ...(useStaticPages404 ? ['/404'] : []),
                  ...(useDefaultStatic500 ? ['/500'] : []),
                ]) {
                  const isSsg = ssgPages.has(page)
                  const isDynamic = isDynamicRoute(page)
                  const isFallback = isSsg && ssgStaticFallbackPages.has(page)

                  for (const locale of i18n.locales) {
                    // skip fallback generation for SSG pages without fallback mode
                    if (isSsg && isDynamic && !isFallback) continue
                    const outputPath = `/${locale}${page === '/' ? '' : page}`

                    defaultMap[outputPath] = {
                      page: defaultMap[page]?.page || page,
                      _locale: locale,
                      _pagesFallback: isFallback,
                    }
                  }

                  if (isSsg) {
                    // remove non-locale prefixed variant from defaultMap
                    delete defaultMap[page]
                  }
                }
              }

              return defaultMap
            },
          }

          const outdir = path.join(distDir, 'export')
          const exportResult = await exportApp(
            dir,
            {
              nextConfig: exportConfig,
              enabledDirectories,
              silent: true,
              buildExport: true,
              debugOutput,
              pages: combinedPages,
              outdir,
              statusMessage: 'Generating static pages',
              numWorkers: getNumberOfWorkers(exportConfig),
            },
            nextBuildSpan
          )

          // If there was no result, there's nothing more to do.
          if (!exportResult) return

          if (debugOutput || process.env.NEXT_SSG_FETCH_METRICS === '1') {
            recordFetchMetrics(exportResult)
          }

          writeTurborepoAccessTraceResult({
            distDir: config.distDir,
            traces: [
              turborepoAccessTraceResult,
              ...exportResult.turborepoAccessTraceResults.values(),
            ],
          })

          prerenderManifest.notFoundRoutes = Array.from(
            exportResult.ssgNotFoundPaths
          )

          // remove server bundles that were exported
          for (const page of staticPages) {
            const serverBundle = getPagePath(page, distDir, undefined, false)
            await fs.unlink(serverBundle)
          }

          staticPaths.forEach((prerenderedRoutes, originalAppPath) => {
            const page = appNormalizedPaths.get(originalAppPath)
            if (!page) throw new InvariantError('Page not found')

            const appConfig = appDefaultConfigs.get(originalAppPath)
            if (!appConfig) throw new InvariantError('App config not found')

            let hasRevalidateZero =
              appConfig.revalidate === 0 ||
              exportResult.byPath.get(page)?.revalidate === 0

            if (hasRevalidateZero && pageInfos.get(page)?.isStatic) {
              // if the page was marked as being static, but it contains dynamic data
              // (ie, in the case of a static generation bailout), then it should be marked dynamic
              pageInfos.set(page, {
                ...(pageInfos.get(page) as PageInfo),
                isStatic: false,
                isSSG: false,
              })
            }

            const isAppRouteHandler = isAppRouteRoute(originalAppPath)

            // When this is an app page and PPR is enabled, the route supports
            // partial pre-rendering.
            const isRoutePPREnabled: true | undefined =
              !isAppRouteHandler &&
              checkIsRoutePPREnabled(config.experimental.ppr, appConfig)
                ? true
                : undefined

            // this flag is used to selectively bypass the static cache and invoke the lambda directly
            // to enable server actions on static routes
            const bypassFor: RouteHas[] = [
              { type: 'header', key: ACTION_HEADER },
              {
                type: 'header',
                key: 'content-type',
                value: 'multipart/form-data;.*',
              },
            ]

            // We should collect all the dynamic routes into a single array for
            // this page. Including the full fallback route (the original
            // route), any routes that were generated with unknown route params
            // should be collected and included in the dynamic routes part
            // of the manifest instead.
            const routes: PrerenderedRoute[] = []
            const dynamicRoutes: PrerenderedRoute[] = []

            // Sort the outputted routes to ensure consistent output. Any route
            // though that has unknown route params will be pulled and sorted
            // independently. This is because the routes with unknown route
            // params will contain the dynamic path parameters, some of which
            // may conflict with the actual prerendered routes.
            let unknownPrerenderRoutes: PrerenderedRoute[] = []
            let knownPrerenderRoutes: PrerenderedRoute[] = []
            for (const prerenderedRoute of prerenderedRoutes) {
              if (
                prerenderedRoute.fallbackRouteParams &&
                prerenderedRoute.fallbackRouteParams.length > 0
              ) {
                unknownPrerenderRoutes.push(prerenderedRoute)
              } else {
                knownPrerenderRoutes.push(prerenderedRoute)
              }
            }

            unknownPrerenderRoutes = getSortedRouteObjects(
              unknownPrerenderRoutes,
              (prerenderedRoute) => prerenderedRoute.pathname
            )
            knownPrerenderRoutes = getSortedRouteObjects(
              knownPrerenderRoutes,
              (prerenderedRoute) => prerenderedRoute.pathname
            )

            prerenderedRoutes = [
              ...knownPrerenderRoutes,
              ...unknownPrerenderRoutes,
            ]

            for (const prerenderedRoute of prerenderedRoutes) {
              // TODO: check if still needed?
              // Exclude the /_not-found route.
              if (prerenderedRoute.pathname === UNDERSCORE_NOT_FOUND_ROUTE) {
                continue
              }

              if (
                isRoutePPREnabled &&
                prerenderedRoute.fallbackRouteParams &&
                prerenderedRoute.fallbackRouteParams.length > 0
              ) {
                // If the route has unknown params, then we need to add it to
                // the list of dynamic routes.
                dynamicRoutes.push(prerenderedRoute)
              } else {
                // If the route doesn't have unknown params, then we need to
                // add it to the list of routes.
                routes.push(prerenderedRoute)
              }
            }

            // Handle all the static routes.
            for (const route of routes) {
              if (isDynamicRoute(page) && route.pathname === page) continue
              if (route.pathname === UNDERSCORE_NOT_FOUND_ROUTE) continue

              const {
                revalidate = appConfig.revalidate ?? false,
                metadata = {},
                hasEmptyPrelude,
                hasPostponed,
              } = exportResult.byPath.get(route.pathname) ?? {}

              pageInfos.set(route.pathname, {
                ...(pageInfos.get(route.pathname) as PageInfo),
                hasPostponed,
                hasEmptyPrelude,
              })

              // update the page (eg /blog/[slug]) to also have the postpone metadata
              pageInfos.set(page, {
                ...(pageInfos.get(page) as PageInfo),
                hasPostponed,
                hasEmptyPrelude,
              })

              if (revalidate !== 0) {
                const normalizedRoute = normalizePagePath(route.pathname)

                let dataRoute: string | null
                if (isAppRouteHandler) {
                  dataRoute = null
                } else {
                  dataRoute = path.posix.join(`${normalizedRoute}${RSC_SUFFIX}`)
                }

                let prefetchDataRoute: string | null | undefined
                // While we may only write the `.rsc` when the route does not
                // have PPR enabled, we still want to generate the route when
                // deployed so it doesn't 404. If the app has PPR enabled, we
                // should add this key.
                if (!isAppRouteHandler && isAppPPREnabled) {
                  prefetchDataRoute = path.posix.join(
                    `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                  )
                }

                const meta = collectMeta(metadata)

                prerenderManifest.routes[route.pathname] = {
                  initialStatus: meta.status,
                  initialHeaders: meta.headers,
                  renderingMode: isAppPPREnabled
                    ? isRoutePPREnabled
                      ? RenderingMode.PARTIALLY_STATIC
                      : RenderingMode.STATIC
                    : undefined,
                  experimentalPPR: isRoutePPREnabled,
                  experimentalBypassFor: bypassFor,
                  initialRevalidateSeconds: revalidate,
                  srcRoute: page,
                  dataRoute,
                  prefetchDataRoute,
                  allowHeader: ALLOWED_HEADERS,
                }
              } else {
                hasRevalidateZero = true
                // we might have determined during prerendering that this page
                // used dynamic data
                pageInfos.set(route.pathname, {
                  ...(pageInfos.get(route.pathname) as PageInfo),
                  isSSG: false,
                  isStatic: false,
                })
              }
            }

            if (!hasRevalidateZero && isDynamicRoute(page)) {
              // When PPR fallbacks aren't used, we need to include it here. If
              // they are enabled, then it'll already be included in the
              // prerendered routes.
              if (!isRoutePPREnabled) {
                dynamicRoutes.push({
                  pathname: page,
                  encodedPathname: page,
                  fallbackRouteParams: undefined,
                  fallbackMode:
                    fallbackModes.get(originalAppPath) ??
                    FallbackMode.NOT_FOUND,
                  fallbackRootParams: undefined,
                })
              }

              for (const route of dynamicRoutes) {
                const normalizedRoute = normalizePagePath(route.pathname)

                const { metadata, revalidate } =
                  exportResult.byPath.get(route.pathname) ?? {}

                let dataRoute: string | null = null
                if (!isAppRouteHandler) {
                  dataRoute = path.posix.join(`${normalizedRoute}${RSC_SUFFIX}`)
                }

                let prefetchDataRoute: string | undefined
                if (!isAppRouteHandler && isAppPPREnabled) {
                  prefetchDataRoute = path.posix.join(
                    `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                  )
                }

                if (!isAppRouteHandler && metadata?.segmentPaths) {
                  const dynamicRoute = routesManifest.dynamicRoutes.find(
                    (r) => r.page === page
                  )
                  if (!dynamicRoute) {
                    throw new Error('Dynamic route not found')
                  }

                  dynamicRoute.prefetchSegmentDataRoutes = []
                  for (const segmentPath of metadata.segmentPaths) {
                    const result = buildPrefetchSegmentDataRoute(
                      route.pathname,
                      segmentPath
                    )
                    dynamicRoute.prefetchSegmentDataRoutes.push(result)
                  }
                }

                pageInfos.set(route.pathname, {
                  ...(pageInfos.get(route.pathname) as PageInfo),
                  isDynamicAppRoute: true,
                  // if PPR is turned on and the route contains a dynamic segment,
                  // we assume it'll be partially prerendered
                  hasPostponed: isRoutePPREnabled,
                })

                const fallbackMode =
                  route.fallbackMode ?? FallbackMode.NOT_FOUND

                // When we're configured to serve a prerender, we should use the
                // fallback revalidate from the export result. If it can't be
                // found, mark that we should keep the shell forever (`false`).
                let fallbackRevalidate: Revalidate | undefined =
                  isRoutePPREnabled && fallbackMode === FallbackMode.PRERENDER
                    ? revalidate ?? false
                    : undefined

                const fallback: Fallback = fallbackModeToFallbackField(
                  fallbackMode,
                  route.pathname
                )

                const meta =
                  metadata &&
                  isRoutePPREnabled &&
                  fallbackMode === FallbackMode.PRERENDER
                    ? collectMeta(metadata)
                    : {}

                prerenderManifest.dynamicRoutes[route.pathname] = {
                  experimentalPPR: isRoutePPREnabled,
                  renderingMode: isAppPPREnabled
                    ? isRoutePPREnabled
                      ? RenderingMode.PARTIALLY_STATIC
                      : RenderingMode.STATIC
                    : undefined,
                  experimentalBypassFor: bypassFor,
                  routeRegex: normalizeRouteRegex(
                    getNamedRouteRegex(route.pathname, {
                      prefixRouteKeys: false,
                    }).re.source
                  ),
                  dataRoute,
                  fallback,
                  fallbackRevalidate,
                  fallbackStatus: meta.status,
                  fallbackHeaders: meta.headers,
                  fallbackRootParams: route.fallbackRootParams,
                  fallbackSourceRoute: route.fallbackRouteParams?.length
                    ? page
                    : undefined,
                  dataRouteRegex: !dataRoute
                    ? null
                    : normalizeRouteRegex(
                        getNamedRouteRegex(dataRoute, {
                          prefixRouteKeys: false,
                          includeSuffix: true,
                          excludeOptionalTrailingSlash: true,
                        }).re.source
                      ),
                  prefetchDataRoute,
                  prefetchDataRouteRegex: !prefetchDataRoute
                    ? undefined
                    : normalizeRouteRegex(
                        getNamedRouteRegex(prefetchDataRoute, {
                          prefixRouteKeys: false,
                          includeSuffix: true,
                          excludeOptionalTrailingSlash: true,
                        }).re.source
                      ),
                  allowHeader: ALLOWED_HEADERS,
                }
              }
            }
          })

          const moveExportedPage = async (
            originPage: string,
            page: string,
            file: string,
            isSsg: boolean,
            ext: 'html' | 'json',
            additionalSsgFile = false
          ) => {
            return staticGenerationSpan
              .traceChild('move-exported-page')
              .traceAsyncFn(async () => {
                file = `${file}.${ext}`
                const orig = path.join(outdir, file)
                const pagePath = getPagePath(
                  originPage,
                  distDir,
                  undefined,
                  false
                )

                const relativeDest = path
                  .relative(
                    path.join(distDir, SERVER_DIRECTORY),
                    path.join(
                      path.join(
                        pagePath,
                        // strip leading / and then recurse number of nested dirs
                        // to place from base folder
                        originPage
                          .slice(1)
                          .split('/')
                          .map(() => '..')
                          .join('/')
                      ),
                      file
                    )
                  )
                  .replace(/\\/g, '/')

                if (
                  !isSsg &&
                  !(
                    // don't add static status page to manifest if it's
                    // the default generated version e.g. no pages/500
                    (
                      STATIC_STATUS_PAGES.includes(page) &&
                      !usedStaticStatusPages.includes(page)
                    )
                  )
                ) {
                  pagesManifest[page] = relativeDest
                }

                const dest = path.join(distDir, SERVER_DIRECTORY, relativeDest)
                const isNotFound =
                  prerenderManifest.notFoundRoutes.includes(page)

                // for SSG files with i18n the non-prerendered variants are
                // output with the locale prefixed so don't attempt moving
                // without the prefix
                if ((!i18n || additionalSsgFile) && !isNotFound) {
                  await fs.mkdir(path.dirname(dest), { recursive: true })
                  await fs.rename(orig, dest)
                } else if (i18n && !isSsg) {
                  // this will be updated with the locale prefixed variant
                  // since all files are output with the locale prefix
                  delete pagesManifest[page]
                }

                if (i18n) {
                  if (additionalSsgFile) return

                  const localeExt = page === '/' ? path.extname(file) : ''
                  const relativeDestNoPages = relativeDest.slice(
                    'pages/'.length
                  )

                  for (const locale of i18n.locales) {
                    const curPath = `/${locale}${page === '/' ? '' : page}`

                    if (
                      isSsg &&
                      prerenderManifest.notFoundRoutes.includes(curPath)
                    ) {
                      continue
                    }

                    const updatedRelativeDest = path
                      .join(
                        'pages',
                        locale + localeExt,
                        // if it's the top-most index page we want it to be locale.EXT
                        // instead of locale/index.html
                        page === '/' ? '' : relativeDestNoPages
                      )
                      .replace(/\\/g, '/')

                    const updatedOrig = path.join(
                      outdir,
                      locale + localeExt,
                      page === '/' ? '' : file
                    )
                    const updatedDest = path.join(
                      distDir,
                      SERVER_DIRECTORY,
                      updatedRelativeDest
                    )

                    if (!isSsg) {
                      pagesManifest[curPath] = updatedRelativeDest
                    }
                    await fs.mkdir(path.dirname(updatedDest), {
                      recursive: true,
                    })
                    await fs.rename(updatedOrig, updatedDest)
                  }
                }
              })
          }

          async function moveExportedAppNotFoundTo404() {
            return staticGenerationSpan
              .traceChild('move-exported-app-not-found-')
              .traceAsyncFn(async () => {
                const orig = path.join(
                  distDir,
                  'server',
                  'app',
                  '_not-found.html'
                )
                const updatedRelativeDest = path
                  .join('pages', '404.html')
                  .replace(/\\/g, '/')

                if (existsSync(orig)) {
                  await fs.copyFile(
                    orig,
                    path.join(distDir, 'server', updatedRelativeDest)
                  )
                  pagesManifest['/404'] = updatedRelativeDest
                }
              })
          }

          // If there's /not-found inside app, we prefer it over the pages 404
          if (hasStaticApp404) {
            await moveExportedAppNotFoundTo404()
          } else {
            // Only move /404 to /404 when there is no custom 404 as in that case we don't know about the 404 page
            if (!hasPages404 && !hasApp404 && useStaticPages404) {
              await moveExportedPage('/_error', '/404', '/404', false, 'html')
            }
          }

          if (useDefaultStatic500) {
            await moveExportedPage('/_error', '/500', '/500', false, 'html')
          }

          for (const page of combinedPages) {
            const isSsg = ssgPages.has(page)
            const isStaticSsgFallback = ssgStaticFallbackPages.has(page)
            const isDynamic = isDynamicRoute(page)
            const hasAmp = hybridAmpPages.has(page)
            const file = normalizePagePath(page)

            const pageInfo = pageInfos.get(page)
            const durationInfo = exportResult.byPage.get(page)
            if (pageInfo && durationInfo) {
              // Set Build Duration
              if (pageInfo.ssgPageRoutes) {
                pageInfo.ssgPageDurations = pageInfo.ssgPageRoutes.map(
                  (pagePath) => {
                    const duration = durationInfo.durationsByPath.get(pagePath)
                    if (typeof duration === 'undefined') {
                      throw new Error("Invariant: page wasn't built")
                    }

                    return duration
                  }
                )
              }
              pageInfo.pageDuration = durationInfo.durationsByPath.get(page)
            }

            // The dynamic version of SSG pages are only prerendered if the
            // fallback is enabled. Below, we handle the specific prerenders
            // of these.
            const hasHtmlOutput = !(isSsg && isDynamic && !isStaticSsgFallback)

            if (hasHtmlOutput) {
              await moveExportedPage(page, page, file, isSsg, 'html')
            }

            if (hasAmp && (!isSsg || (isSsg && !isDynamic))) {
              const ampPage = `${file}.amp`
              await moveExportedPage(page, ampPage, ampPage, isSsg, 'html')

              if (isSsg) {
                await moveExportedPage(page, ampPage, ampPage, isSsg, 'json')
              }
            }

            if (isSsg) {
              // For a non-dynamic SSG page, we must copy its data file
              // from export, we already moved the HTML file above
              if (!isDynamic) {
                await moveExportedPage(page, page, file, isSsg, 'json')

                if (i18n) {
                  // TODO: do we want to show all locale variants in build output
                  for (const locale of i18n.locales) {
                    const localePage = `/${locale}${page === '/' ? '' : page}`

                    prerenderManifest.routes[localePage] = {
                      initialRevalidateSeconds:
                        exportResult.byPath.get(localePage)?.revalidate ??
                        false,
                      experimentalPPR: undefined,
                      renderingMode: undefined,
                      srcRoute: null,
                      dataRoute: path.posix.join(
                        '/_next/data',
                        buildId,
                        `${file}.json`
                      ),
                      prefetchDataRoute: undefined,
                      allowHeader: ALLOWED_HEADERS,
                    }
                  }
                } else {
                  prerenderManifest.routes[page] = {
                    initialRevalidateSeconds:
                      exportResult.byPath.get(page)?.revalidate ?? false,
                    experimentalPPR: undefined,
                    renderingMode: undefined,
                    srcRoute: null,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${file}.json`
                    ),
                    // Pages does not have a prefetch data route.
                    prefetchDataRoute: undefined,
                    allowHeader: ALLOWED_HEADERS,
                  }
                }
                // Set Page Revalidation Interval
                if (pageInfo) {
                  pageInfo.initialRevalidateSeconds =
                    exportResult.byPath.get(page)?.revalidate ?? false
                }
              } else {
                // For a dynamic SSG page, we did not copy its data exports and only
                // copy the fallback HTML file (if present).
                // We must also copy specific versions of this page as defined by
                // `getStaticPaths` (additionalSsgPaths).
                for (const route of additionalPaths.get(page) ?? []) {
                  const pageFile = normalizePagePath(route.pathname)
                  await moveExportedPage(
                    page,
                    route.pathname,
                    pageFile,
                    isSsg,
                    'html',
                    true
                  )
                  await moveExportedPage(
                    page,
                    route.pathname,
                    pageFile,
                    isSsg,
                    'json',
                    true
                  )

                  if (hasAmp) {
                    const ampPage = `${pageFile}.amp`
                    await moveExportedPage(
                      page,
                      ampPage,
                      ampPage,
                      isSsg,
                      'html',
                      true
                    )
                    await moveExportedPage(
                      page,
                      ampPage,
                      ampPage,
                      isSsg,
                      'json',
                      true
                    )
                  }

                  const initialRevalidateSeconds =
                    exportResult.byPath.get(route.pathname)?.revalidate ?? false

                  if (typeof initialRevalidateSeconds === 'undefined') {
                    throw new Error("Invariant: page wasn't built")
                  }

                  prerenderManifest.routes[route.pathname] = {
                    initialRevalidateSeconds,
                    experimentalPPR: undefined,
                    renderingMode: undefined,
                    srcRoute: page,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${normalizePagePath(route.pathname)}.json`
                    ),
                    // Pages does not have a prefetch data route.
                    prefetchDataRoute: undefined,
                    allowHeader: ALLOWED_HEADERS,
                  }

                  // Set route Revalidation Interval
                  if (pageInfo) {
                    pageInfo.initialRevalidateSeconds = initialRevalidateSeconds
                  }
                }
              }
            }
          }

          // remove temporary export folder
          await fs.rm(outdir, { recursive: true, force: true })
          await writeManifest(pagesManifestPath, pagesManifest)
        })

        // We need to write the manifest with rewrites after build as it might
        // have been modified.
        await nextBuildSpan
          .traceChild('write-routes-manifest')
          .traceAsyncFn(() => writeManifest(routesManifestPath, routesManifest))
      }

      const postBuildSpinner = createSpinner('Finalizing page optimization')
      let buildTracesSpinner = createSpinner(`Collecting build traces`)

      // ensure the worker is not left hanging
      worker.end()

      const analysisEnd = process.hrtime(analysisBegin)
      telemetry.record(
        eventBuildOptimize(pagesPaths, {
          durationInSeconds: analysisEnd[0],
          staticPageCount: staticPages.size,
          staticPropsPageCount: ssgPages.size,
          serverPropsPageCount: serverPropsPages.size,
          ssrPageCount:
            pagesPaths.length -
            (staticPages.size + ssgPages.size + serverPropsPages.size),
          hasStatic404: useStaticPages404,
          hasReportWebVitals:
            namedExports?.includes('reportWebVitals') ?? false,
          rewritesCount: combinedRewrites.length,
          headersCount: headers.length,
          redirectsCount: redirects.length - 1, // reduce one for trailing slash
          headersWithHasCount: headers.filter((r: any) => !!r.has).length,
          rewritesWithHasCount: combinedRewrites.filter((r: any) => !!r.has)
            .length,
          redirectsWithHasCount: redirects.filter((r: any) => !!r.has).length,
          middlewareCount: hasMiddlewareFile ? 1 : 0,
          totalAppPagesCount,
          staticAppPagesCount,
          serverAppPagesCount,
          edgeRuntimeAppCount,
          edgeRuntimePagesCount,
        })
      )

      if (NextBuildContext.telemetryState) {
        const events = eventBuildFeatureUsage(
          NextBuildContext.telemetryState.usages
        )
        telemetry.record(events)
        telemetry.record(
          eventPackageUsedInGetServerSideProps(
            NextBuildContext.telemetryState.packagesUsedInServerSideProps
          )
        )
        const useCacheTracker = NextBuildContext.telemetryState.useCacheTracker

        for (const [key, value] of Object.entries(useCacheTracker)) {
          telemetry.record(
            eventBuildFeatureUsage([
              {
                featureName: key as UseCacheTrackerKey,
                invocationCount: value,
              },
            ])
          )
        }
      }

      if (ssgPages.size > 0 || appDir) {
        tbdPrerenderRoutes.forEach((tbdRoute) => {
          const normalizedRoute = normalizePagePath(tbdRoute)
          const dataRoute = path.posix.join(
            '/_next/data',
            buildId,
            `${normalizedRoute}.json`
          )

          prerenderManifest.dynamicRoutes[tbdRoute] = {
            routeRegex: normalizeRouteRegex(
              getNamedRouteRegex(tbdRoute, {
                prefixRouteKeys: false,
              }).re.source
            ),
            experimentalPPR: undefined,
            renderingMode: undefined,
            dataRoute,
            fallback: ssgBlockingFallbackPages.has(tbdRoute)
              ? null
              : ssgStaticFallbackPages.has(tbdRoute)
                ? `${normalizedRoute}.html`
                : false,
            fallbackRevalidate: undefined,
            fallbackSourceRoute: undefined,
            fallbackRootParams: undefined,
            dataRouteRegex: normalizeRouteRegex(
              getNamedRouteRegex(dataRoute, {
                prefixRouteKeys: true,
                includeSuffix: true,
                excludeOptionalTrailingSlash: true,
              }).re.source
            ),
            // Pages does not have a prefetch data route.
            prefetchDataRoute: undefined,
            prefetchDataRouteRegex: undefined,
            allowHeader: ALLOWED_HEADERS,
          }
        })

        NextBuildContext.previewModeId = previewProps.previewModeId
        NextBuildContext.fetchCacheKeyPrefix =
          config.experimental.fetchCacheKeyPrefix
        NextBuildContext.allowedRevalidateHeaderKeys =
          config.experimental.allowedRevalidateHeaderKeys

        await writePrerenderManifest(distDir, prerenderManifest)
        await writeClientSsgManifest(prerenderManifest, {
          distDir,
          buildId,
          locales: config.i18n?.locales,
        })
      } else {
        await writePrerenderManifest(distDir, {
          version: 4,
          routes: {},
          dynamicRoutes: {},
          preview: previewProps,
          notFoundRoutes: [],
        })
      }

      await writeImagesManifest(distDir, config)
      await writeManifest(path.join(distDir, EXPORT_MARKER), {
        version: 1,
        hasExportPathMap: typeof config.exportPathMap === 'function',
        exportTrailingSlash: config.trailingSlash === true,
        isNextImageImported: isNextImageImported === true,
      })
      await fs.unlink(path.join(distDir, EXPORT_DETAIL)).catch((err) => {
        if (err.code === 'ENOENT') {
          return Promise.resolve()
        }
        return Promise.reject(err)
      })

      if (Boolean(config.experimental.nextScriptWorkers)) {
        await nextBuildSpan
          .traceChild('verify-partytown-setup')
          .traceAsyncFn(async () => {
            await verifyPartytownSetup(
              dir,
              path.join(distDir, CLIENT_STATIC_FILES_PATH)
            )
          })
      }

      await buildTracesPromise

      if (buildTracesSpinner) {
        buildTracesSpinner.stopAndPersist()
        buildTracesSpinner = undefined
      }

      if (config.output === 'export') {
        await writeFullyStaticExport(
          config,
          dir,
          enabledDirectories,
          configOutDir,
          nextBuildSpan
        )
      }

      if (config.output === 'standalone') {
        await writeStandaloneDirectory(
          nextBuildSpan,
          distDir,
          pageKeys,
          denormalizedAppPages,
          outputFileTracingRoot,
          requiredServerFilesManifest,
          middlewareManifest,
          hasNodeMiddleware,
          hasInstrumentationHook,
          staticPages,
          loadedEnvFiles,
          appDir
        )
      }

      if (postBuildSpinner) postBuildSpinner.stopAndPersist()
      console.log()

      if (debugOutput) {
        nextBuildSpan
          .traceChild('print-custom-routes')
          .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
      }

      await nextBuildSpan.traceChild('print-tree-view').traceAsyncFn(() =>
        printTreeView(pageKeys, pageInfos, {
          distPath: distDir,
          buildId: buildId,
          pagesDir,
          useStaticPages404,
          pageExtensions: config.pageExtensions,
          appBuildManifest,
          buildManifest,
          middlewareManifest,
          gzipSize: config.experimental.gzipSize,
        })
      )

      await nextBuildSpan
        .traceChild('telemetry-flush')
        .traceAsyncFn(() => telemetry.flush())

      await shutdownPromise
    })
  } finally {
    // Ensure we wait for lockfile patching if present
    await lockfilePatchPromise.cur

    // Ensure all traces are flushed before finishing the command
    await flushAllTraces()
    teardownTraceSubscriber()

    if (traceUploadUrl && loadedConfig) {
      uploadTrace({
        traceUploadUrl,
        mode: 'build',
        projectDir: dir,
        distDir: loadedConfig.distDir,
        isTurboSession: turboNextBuild,
        sync: true,
      })
    }
  }
}
