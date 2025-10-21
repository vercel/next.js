import type { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import type { ActionManifest } from './webpack/plugins/flight-client-entry-plugin'
import type { CacheControl, Revalidate } from '../server/lib/cache-control'

import '../lib/setup-exception-listeners'

import { loadEnvConfig, type LoadedEnvFiles } from '@next/env'
import { bold, yellow } from '../lib/picocolors'
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
  PROXY_FILENAME,
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
import { recursiveDeleteSyncWithAsyncRetries } from '../lib/recursive-delete'
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
  RSC_MODULE_TYPES,
  NEXT_FONT_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  FUNCTIONS_CONFIG_MANIFEST,
  DYNAMIC_CSS_MANIFEST,
  TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST,
} from '../shared/lib/constants'
import {
  UNDERSCORE_NOT_FOUND_ROUTE,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
} from '../shared/lib/entry-constants'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { Bundler, finalizeBundlerFromConfig } from '../lib/bundler'
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
  eventBuildFailed,
} from '../telemetry/events'
import type { EventBuildFeatureUsage } from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import {
  createPagesMapping,
  collectAppFiles,
  processPageRoutes,
  processAppRoutes,
  processLayoutRoutes,
  extractSlotsFromAppRoutes,
  extractSlotsFromDefaultFiles,
  combineSlots,
  type RouteInfo,
  type SlotInfo,
  collectPagesFiles,
} from './entries'
import { sortByPageExts } from './sort-by-page-exts'
import { getStaticInfoIncludingLayouts } from './get-static-info-including-layouts'
import { PAGE_TYPES } from '../lib/page-types'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import * as Log from './output/log'
import createSpinner from './spinner'
import { trace, flushAllTraces, setGlobal, type Span } from '../trace'
import {
  detectConflictingPaths,
  printCustomRoutes,
  printTreeView,
  copyTracedFiles,
  isReservedPage,
  isAppBuiltinPage,
  collectRoutesUsingEdgeRuntime,
  collectMeta,
} from './utils'
import type { PageInfo, PageInfos } from './utils'
import type { FallbackRouteParam, PrerenderedRoute } from './static-paths/types'
import type { AppSegmentConfig } from './segment-config/app/app-segment-config'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import isError from '../lib/is-error'
import type { NextError } from '../lib/is-error'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { recursiveCopy } from '../lib/recursive-copy'
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
import { InvariantError } from '../shared/lib/invariant-error'
import { HTML_LIMITED_BOT_UA_RE_STRING } from '../shared/lib/router/utils/is-bot'
import type { UseCacheTrackerKey } from './webpack/plugins/telemetry-plugin/use-cache-tracker-utils'
import {
  buildInversePrefetchSegmentDataRoute,
  buildPrefetchSegmentDataRoute,
  type PrefetchSegmentDataRoute,
} from '../server/lib/router-utils/build-prefetch-segment-data-route'

import { turbopackBuild } from './turbopack-build'
import { isFileSystemCacheEnabledForBuild } from '../shared/lib/turbopack/utils'
import { inlineStaticEnv } from '../lib/inline-static-env'
import { populateStaticEnv } from '../lib/static-env'
import { durationToString, hrtimeDurationToString } from './duration-to-string'
import { traceGlobals } from '../trace/shared'
import { extractNextErrorCode } from '../lib/error-telemetry-utils'
import { runAfterProductionCompile } from './after-production-compile'
import { generatePreviewKeys } from './preview-key-utils'
import { handleBuildComplete } from './adapter/build-complete'
import {
  sortPageObjects,
  sortPages,
  sortSortableRouteObjects,
} from '../shared/lib/router/utils/sortable-routes'
import { mkdir } from 'fs/promises'
import {
  createRouteTypesManifest,
  writeRouteTypesManifest,
  writeValidatorFile,
} from '../server/lib/router-utils/route-types-utils'
import { Lockfile } from './lockfile'

type Fallback = null | boolean | string

export interface PrerenderManifestRoute {
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
   * The revalidate value for this route. This might be inferred from:
   * - route segment configs
   * - fetch calls
   * - unstable_cache
   * - "use cache"
   */
  initialRevalidateSeconds: Revalidate

  /**
   * The expire value for this route, which is inferred from the "use cache"
   * functions that are used by the route, or the expireTime config.
   */
  initialExpireSeconds: number | undefined

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

export interface DynamicPrerenderManifestRoute {
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
   * When defined, it describes the expire configuration for the fallback route.
   */
  fallbackExpire: number | undefined

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
   * The fallback route params for this route that were parsed from the loader
   * tree.
   */
  fallbackRouteParams: readonly FallbackRouteParam[] | undefined

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
  routes: { [route: string]: PrerenderManifestRoute }
  dynamicRoutes: { [route: string]: DynamicPrerenderManifestRoute }
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
  namedRegex: string
  routeKeys: { [key: string]: string }

  /**
   * If true, this indicates that the route has fallback root params. This is
   * used to simplify the route regex for matching.
   */
  hasFallbackRootParams?: boolean

  /**
   * The prefetch segment data routes for this route. This is used to rewrite
   * the prefetch segment data routes (or the inverse) to the correct
   * destination.
   */
  prefetchSegmentDataRoutes?: PrefetchSegmentDataRoute[]

  /**
   * If true, this indicates that the route should not be considered for routing
   * for the internal router, and instead has been added to support external
   * routers.
   */
  skipInternalRouting?: boolean
}

type DynamicManifestRoute = ManifestRoute & {
  /**
   * The source page that this route is based on. This is used to determine the
   * source page for the route and is only relevant for app pages where PPR is
   * enabled and the page differs from the source page.
   */
  sourcePage: string | undefined
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
  redirects: Array<ManifestRedirectRoute>
  rewrites: {
    beforeFiles: Array<ManifestRewriteRoute>
    afterFiles: Array<ManifestRewriteRoute>
    fallback: Array<ManifestRewriteRoute>
  }
  headers: Array<ManifestHeaderRoute>
  staticRoutes: Array<ManifestRoute>
  dynamicRoutes: ReadonlyArray<DynamicManifestRoute>
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

    /**
     * Whether the client param parsing is enabled. This is automatically enabled when
     * cacheComponents is enabled.
     */
    clientParamParsing: boolean

    /**
     * The origins that are allowed to write the rewritten headers when
     * performing a non-relative rewrite. When undefined, no non-relative
     * rewrites will get the rewrite headers.
     */
    clientParamParsingOrigins: string[] | undefined
    dynamicRSCPrerender: boolean
  }
  rewriteHeaders: {
    pathHeader: typeof NEXT_REWRITTEN_PATH_HEADER
    queryHeader: typeof NEXT_REWRITTEN_QUERY_HEADER
  }
  skipProxyUrlNormalize?: boolean
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

/**
 * Converts a page to a manifest route.
 *
 * @param page The page to convert to a route.
 * @returns A route object.
 */
function pageToRoute(page: string): ManifestRoute
/**
 * Converts a page to a dynamic manifest route.
 *
 * @param page The page to convert to a route.
 * @param sourcePage The source page that this route is based on. This is used
 * to determine the source page for the route and is only relevant for app
 * pages when PPR is enabled on them.
 * @returns A route object.
 */
function pageToRoute(
  page: string,
  sourcePage: string | undefined
): DynamicManifestRoute
function pageToRoute(
  page: string,
  sourcePage?: string
): DynamicManifestRoute | ManifestRoute {
  const routeRegex = getNamedRouteRegex(page, {
    prefixRouteKeys: true,
  })
  return {
    sourcePage,
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
      regions?: string[] | string
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

export interface RequiredServerFilesManifest {
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
    protocol: p.protocol?.replace(/:$/, '') as 'http' | 'https' | undefined,
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
          path.relative(outputFileTracingRoot, distDir),
          SERVER_DIRECTORY,
          'middleware.js'
        )

        await fs.mkdir(path.dirname(middlewareOutput), { recursive: true })
        await fs.copyFile(
          path.join(distDir, SERVER_DIRECTORY, 'middleware.js'),
          middlewareOutput
        )
      }

      const originalPagesDir = path.join(distDir, SERVER_DIRECTORY, 'pages')

      if (existsSync(originalPagesDir)) {
        await recursiveCopy(
          originalPagesDir,
          path.join(
            distDir,
            STANDALONE_DIRECTORY,
            path.relative(outputFileTracingRoot, distDir),
            SERVER_DIRECTORY,
            'pages'
          ),
          { overwrite: true }
        )
      }

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
export type StaticWorker = typeof import('./worker') & Worker
export function createStaticWorker(
  config: NextConfigComplete,
  options: {
    debuggerPortOffset: number
    progress?: {
      run: () => void
      clear: () => void
    }
  }
): StaticWorker {
  const { debuggerPortOffset, progress } = options
  return new Worker(staticWorkerPath, {
    logger: Log,
    numWorkers: getNumberOfWorkers(config),
    onActivity: () => {
      progress?.run()
    },
    onActivityAbort: () => {
      progress?.clear()
    },
    debuggerPortOffset,
    enableSourceMaps: config.enablePrerenderSourceMaps,
    // remove --max-old-space-size flag as it can cause memory issues.
    isolatedMemory: true,
    enableWorkerThreads: config.experimental.workerThreads,
    exposedMethods: staticWorkerExposedMethods,
  }) as StaticWorker
}

async function writeFullyStaticExport(
  config: NextConfigComplete,
  dir: string,
  enabledDirectories: NextEnabledDirectories,
  configOutDir: string,
  nextBuildSpan: Span,
  appDirOnly: boolean
): Promise<void> {
  const exportApp = (require('../export') as typeof import('../export'))
    .default as typeof import('../export').default

  await exportApp(
    dir,
    {
      buildExport: false,
      nextConfig: config,
      enabledDirectories,
      silent: true,
      outdir: path.join(dir, configOutDir),
      numWorkers: getNumberOfWorkers(config),
      appDirOnly,
    },
    nextBuildSpan
  )
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
  debugPrerender = false,
  noMangling = false,
  appDirOnly = false,
  bundler = Bundler.Turbopack,
  experimentalBuildMode: 'default' | 'compile' | 'generate' | 'generate-env',
  traceUploadUrl: string | undefined,
  debugBuildAppPaths?: string[],
  debugBuildPagePaths?: string[]
): Promise<void> {
  const isCompileMode = experimentalBuildMode === 'compile'
  const isGenerateMode = experimentalBuildMode === 'generate'
  NextBuildContext.isCompileMode = isCompileMode
  const buildStartTime = Date.now()

  let loadedConfig: NextConfigComplete | undefined
  try {
    const nextBuildSpan = trace('next-build', undefined, {
      buildMode: experimentalBuildMode,
      version: process.env.__NEXT_VERSION as string,
    })

    NextBuildContext.nextBuildSpan = nextBuildSpan
    NextBuildContext.dir = dir
    NextBuildContext.appDirOnly = appDirOnly
    NextBuildContext.reactProductionProfiling = reactProductionProfiling
    NextBuildContext.noMangling = noMangling
    NextBuildContext.debugPrerender = debugPrerender

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
                debugPrerender,
              }),
            turborepoAccessTraceResult
          )
        )
      loadedConfig = config

      // Reading the config can modify environment variables that influence the bundler selection.
      bundler = finalizeBundlerFromConfig(bundler)
      nextBuildSpan.setAttribute('bundler', getBundlerForTelemetry(bundler))

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

      if (experimentalBuildMode === 'generate-env') {
        if (bundler === Bundler.Turbopack) {
          Log.warn('generate-env is not needed with turbopack')
          process.exit(0)
        }
        Log.info('Inlining static env ...')
        await nextBuildSpan
          .traceChild('inline-static-env')
          .traceAsyncFn(async () => {
            await inlineStaticEnv({
              distDir,
              config,
            })
          })

        Log.info('Complete')
        await flushAllTraces()
        teardownTraceSubscriber()
        process.exit(0)
      }

      // when using compile mode static env isn't inlined so we
      // need to populate in normal runtime env
      if (isCompileMode || isGenerateMode) {
        populateStaticEnv(config)
      }

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

      if (config.experimental.lockDistDir) {
        // This leaks the lock file descriptor. That's okay, it'll be cleaned up by the OS upon
        // process exit.
        await Lockfile.acquireWithRetriesOrExit(
          path.join(distDir, 'lock'),
          'next build'
        )
      }

      if (config.cleanDistDir && !isGenerateMode) {
        await nextBuildSpan
          .traceChild('clean')
          .traceAsyncFn(() =>
            recursiveDeleteSyncWithAsyncRetries(distDir, /^(cache|dev|lock)/)
          )
      }

      const cacheDir = getCacheDir(distDir)

      const telemetry = new Telemetry({ distDir })

      setGlobal('telemetry', telemetry)

      const publicDir = path.join(dir, 'public')
      const { pagesDir, appDir } = findPagesDir(dir)

      if (!appDirOnly && !pagesDir) {
        appDirOnly = true
      }

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
        eventCliSession(config, {
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
      const { envInfo, experimentalFeatures, cacheComponents } =
        await getStartServerInfo({
          dir,
          dev: false,
          debugPrerender,
        })

      logStartInfo({
        networkUrl: null,
        appUrl: null,
        envInfo,
        experimentalFeatures,
        logBundler: true,
        cacheComponents,
      })

      const typeCheckingOptions: Parameters<typeof startTypeChecking>[0] = {
        dir,
        appDir,
        pagesDir,
        telemetry,
        nextBuildSpan,
        config,
        cacheDir,
      }

      if (appDir && 'exportPathMap' in config) {
        Log.error(
          'The "exportPathMap" configuration cannot be used with the "app" directory. Please use generateStaticParams() instead.'
        )
        await telemetry.flush()
        process.exit(1)
      }

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
          ? await nextBuildSpan
              .traceChild('collect-pages')
              .traceAsyncFn(() => collectPagesFiles(pagesDir, validFileMatcher))
          : []

      // Apply debug build paths filter if specified
      // If debugBuildPagePaths is defined (even if empty), only build specified pages
      if (debugBuildPagePaths !== undefined) {
        if (debugBuildPagePaths.length > 0) {
          const debugPathsSet = new Set(debugBuildPagePaths)
          pagesPaths = pagesPaths.filter((pagePath) =>
            debugPathsSet.has(pagePath)
          )
        } else {
          // Empty array means build no pages
          pagesPaths = []
        }
      }

      const middlewareDetectionRegExp = new RegExp(
        `^${MIDDLEWARE_FILENAME}\\.(?:${config.pageExtensions.join('|')})$`
      )

      const proxyDetectionRegExp = new RegExp(
        `^${PROXY_FILENAME}\\.(?:${config.pageExtensions.join('|')})$`
      )

      const instrumentationHookDetectionRegExp = new RegExp(
        `^${INSTRUMENTATION_HOOK_FILENAME}\\.(?:${config.pageExtensions.join(
          '|'
        )})$`
      )

      const rootDir = path.join((pagesDir || appDir)!, '..')
      const includes = [
        middlewareDetectionRegExp,
        proxyDetectionRegExp,
        instrumentationHookDetectionRegExp,
      ]

      const rootPaths = Array.from(await getFilesInDir(rootDir))
        .filter((file) => includes.some((include) => include.test(file)))
        .sort(sortByPageExts(config.pageExtensions))
        .map((file) => path.join(rootDir, file).replace(dir, ''))

      let instrumentationHookFilePath: string | undefined
      let proxyFilePath: string | undefined
      let middlewareFilePath: string | undefined

      for (const rootPath of rootPaths) {
        const { name: fileBaseName, dir: fileDir } = path.parse(rootPath)
        const isAtConventionLevel =
          fileDir === '/' ||
          fileDir === '/src' ||
          // rootPaths are currently relative paths from the root directory.
          // Add safety check here for unexpected future changes.
          fileDir === dir ||
          fileDir === path.join(dir, 'src')

        if (isAtConventionLevel && fileBaseName === MIDDLEWARE_FILENAME) {
          middlewareFilePath = rootPath
        }
        if (isAtConventionLevel && fileBaseName === PROXY_FILENAME) {
          proxyFilePath = rootPath
        }
        if (
          isAtConventionLevel &&
          fileBaseName === INSTRUMENTATION_HOOK_FILENAME
        ) {
          instrumentationHookFilePath = rootPath
        }
      }

      if (middlewareFilePath) {
        if (proxyFilePath) {
          const cwd = process.cwd()
          const absoluteProxyPath = path.join(rootDir, proxyFilePath)
          const absoluteMiddlewarePath = path.join(rootDir, middlewareFilePath)

          throw new Error(
            `Both ${MIDDLEWARE_FILENAME} file "./${path.relative(cwd, absoluteMiddlewarePath)}" and ${PROXY_FILENAME} file "./${path.relative(cwd, absoluteProxyPath)}" are detected. Please use "./${path.relative(cwd, absoluteProxyPath)}" only. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
          )
        }
        Log.warnOnce(
          `The "${MIDDLEWARE_FILENAME}" file convention is deprecated. Please use "${PROXY_FILENAME}" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
        )
      }

      const hasInstrumentationHook = Boolean(instrumentationHookFilePath)
      const hasMiddlewareFile = Boolean(middlewareFilePath)
      const hasProxyFile = Boolean(proxyFilePath)

      NextBuildContext.hasInstrumentationHook = hasInstrumentationHook

      const previewProps: __ApiPreviewProps = await generatePreviewKeys({
        isBuild: true,
        distDir,
      })
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
            appDirOnly,
          })
        )
      NextBuildContext.mappedPages = mappedPages

      let mappedAppPages: MappedPages | undefined
      let mappedAppLayouts: MappedPages | undefined
      let denormalizedAppPages: string[] | undefined

      if (appDir) {
        const providedAppPaths: string[] = JSON.parse(
          process.env.NEXT_PRIVATE_APP_PATHS || '[]'
        )

        let appPaths: string[]
        let layoutPaths: string[]

        if (Boolean(process.env.NEXT_PRIVATE_APP_PATHS)) {
          // used for testing
          appPaths = providedAppPaths
          layoutPaths = []
        } else {
          // Collect app pages, layouts, and default files in a single directory traversal
          const result = await nextBuildSpan
            .traceChild('collect-app-files')
            .traceAsyncFn(() => collectAppFiles(appDir, validFileMatcher))

          appPaths = result.appPaths
          layoutPaths = result.layoutPaths

          // Apply debug build paths filter if specified
          // If debugBuildAppPaths is defined (even if empty), only build specified app paths
          if (debugBuildAppPaths !== undefined) {
            if (debugBuildAppPaths.length > 0) {
              const debugPathsSet = new Set(debugBuildAppPaths)
              appPaths = appPaths.filter((appPath) =>
                debugPathsSet.has(appPath)
              )
            } else {
              // Empty array means build no app paths
              appPaths = []
            }
          }
          // Note: defaultPaths are not used in the build process, only for slot detection in generating route types
        }

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
              appDirOnly,
            })
          )

        mappedAppLayouts = await nextBuildSpan
          .traceChild('create-app-layouts')
          .traceAsyncFn(() =>
            createPagesMapping({
              pagePaths: layoutPaths,
              isDev: false,
              pagesType: PAGE_TYPES.APP,
              pageExtensions: config.pageExtensions,
              pagesDir,
              appDir,
              appDirOnly,
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
        appDirOnly,
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

      await nextBuildSpan
        .traceChild('generate-route-types')
        .traceAsyncFn(async () => {
          const routeTypesFilePath = path.join(distDir, 'types', 'routes.d.ts')
          const validatorFilePath = path.join(distDir, 'types', 'validator.ts')
          await mkdir(path.dirname(routeTypesFilePath), { recursive: true })

          let appRoutes: RouteInfo[] = []
          let appRouteHandlers: RouteInfo[] = []
          let layoutRoutes: RouteInfo[] = []
          let slots: SlotInfo[] = []

          const { pageRoutes, pageApiRoutes } = processPageRoutes(
            mappedPages,
            dir,
            isSrcDir
          )

          // Build app routes
          if (appDir && mappedAppPages) {
            // Extract slots from both pages and default files
            const slotsFromPages = extractSlotsFromAppRoutes(mappedAppPages)
            let slotsFromDefaults: SlotInfo[] = []

            // Collect and map default files for slot extraction
            const { defaultPaths } = await nextBuildSpan
              .traceChild('collect-default-files')
              .traceAsyncFn(() => collectAppFiles(appDir, validFileMatcher))

            if (defaultPaths.length > 0) {
              const mappedDefaultFiles = await nextBuildSpan
                .traceChild('create-default-mapping')
                .traceAsyncFn(() =>
                  createPagesMapping({
                    pagePaths: defaultPaths,
                    isDev: false,
                    pagesType: PAGE_TYPES.APP,
                    pageExtensions: config.pageExtensions,
                    pagesDir,
                    appDir,
                    appDirOnly,
                  })
                )
              slotsFromDefaults =
                extractSlotsFromDefaultFiles(mappedDefaultFiles)
            }

            // Combine slots and deduplicate using Set
            slots = combineSlots(slotsFromPages, slotsFromDefaults)

            const result = processAppRoutes(
              mappedAppPages,
              validFileMatcher,
              dir,
              isSrcDir
            )
            appRoutes = result.appRoutes
            appRouteHandlers = result.appRouteHandlers
          }

          // Build app layouts
          if (appDir && mappedAppLayouts) {
            layoutRoutes = processLayoutRoutes(mappedAppLayouts, dir, isSrcDir)
          }

          const routeTypesManifest = await createRouteTypesManifest({
            dir,
            pageRoutes,
            appRoutes,
            appRouteHandlers,
            pageApiRoutes,
            layoutRoutes,
            slots,
            redirects: config.redirects,
            rewrites: config.rewrites,
            validatorFilePath,
          })

          await writeRouteTypesManifest(
            routeTypesManifest,
            routeTypesFilePath,
            config
          )
          await writeValidatorFile(routeTypesManifest, validatorFilePath)
        })

      // Turbopack already handles conflicting app and page routes.
      if (bundler !== Bundler.Turbopack) {
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
      const hasAppGlobalError =
        !!mappedAppPages?.[UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY]
      const hasCustomErrorPage =
        mappedPages['/_error']?.startsWith(PAGES_DIR_ALIAS)

      // Check if there are any user pages (non-reserved pages) in the pages router
      const hasUserPagesRoutes = Object.keys(mappedPages).some(
        (route) => !isReservedPage(route)
      )

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

      const isAppCacheComponentsEnabled = Boolean(config.cacheComponents)
      const isAuthInterruptsEnabled = Boolean(
        config.experimental.authInterrupts
      )
      const isAppPPREnabled = checkIsAppPPREnabled(config.experimental.ppr)

      const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
      const dynamicRoutes: Array<DynamicManifestRoute> = []

      /**
       * A map of all the pages to their sourcePage value. This is only used for
       * routes that have PPR enabled and clientSegmentEnabled is true.
       */
      const sourcePages = new Map<string, string>()
      const routesManifest: RoutesManifest = nextBuildSpan
        .traceChild('generate-routes-manifest')
        .traceFn(() => {
          const sortedRoutes = sortPages([
            ...pageKeys.pages,
            ...(pageKeys.app ?? []),
          ])
          const staticRoutes: Array<ManifestRoute> = []

          for (const route of sortedRoutes) {
            if (isDynamicRoute(route)) {
              dynamicRoutes.push(
                pageToRoute(
                  route,
                  // This property is only relevant when PPR is enabled.
                  undefined
                )
              )
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
            rewrites: {
              beforeFiles: rewrites.beforeFiles.map((r) =>
                buildCustomRoute('rewrite', r)
              ),
              afterFiles: rewrites.afterFiles.map((r) =>
                buildCustomRoute('rewrite', r)
              ),
              fallback: rewrites.fallback.map((r) =>
                buildCustomRoute('rewrite', r)
              ),
            },
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
              clientParamParsing: config.cacheComponents ?? false,
              clientParamParsingOrigins:
                config.experimental.clientParamParsingOrigins,
              dynamicRSCPrerender:
                isAppPPREnabled && config.cacheComponents === true,
            },
            rewriteHeaders: {
              pathHeader: NEXT_REWRITTEN_PATH_HEADER,
              queryHeader: NEXT_REWRITTEN_QUERY_HEADER,
            },
            skipProxyUrlNormalize: config.skipProxyUrlNormalize,
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

      // For pages directory, we run type checking after route collection but before build.
      if (!appDir && !isCompileMode) {
        await startTypeChecking(typeCheckingOptions)
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
        if (bundler === Bundler.Turbopack) {
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

          const durationString = durationToString(compilerDuration)
          Log.event(`Compiled successfully in ${durationString}`)

          telemetry.record(
            eventBuildCompleted(pagesPaths, {
              bundler: 'turbopack',
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
                    debuggerPortOffset: -1,
                    isolatedMemory: false,
                    numWorkers: 1,
                    exposedMethods: ['collectBuildTraces'],
                  }
                ) as Worker & typeof import('./collect-build-traces')

                buildTracesPromise = nextBuildSpan
                  .traceChild('collect-build-traces')
                  .traceAsyncFn(() => {
                    return buildTraceWorker
                      .collectBuildTraces({
                        dir,
                        config,
                        distDir,
                        // Serialize Map as this is sent to the worker.
                        edgeRuntimeRoutes: collectRoutesUsingEdgeRuntime(
                          new Map()
                        ),
                        staticPages: [],
                        buildTraceContext,
                        outputFileTracingRoot,
                      })
                      .catch((err) => {
                        console.error(err)
                        process.exit(1)
                      })
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

            const durationString = durationToString(durationInSeconds)
            Log.event(`Compiled successfully in ${durationString}`)

            telemetry.record(
              eventBuildCompleted(pagesPaths, {
                bundler: getBundlerForTelemetry(bundler),
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
                bundler: getBundlerForTelemetry(bundler),
                durationInSeconds: compilerDuration,
                totalAppPagesCount,
              })
            )
          }
        }
        await runAfterProductionCompile({
          config,
          buildSpan: nextBuildSpan,
          telemetry,
          metadata: {
            projectDir: dir,
            distDir,
          },
        })
      }

      // For app directory, we run type checking after build.
      if (appDir && !isCompileMode && !isGenerateMode) {
        await updateBuildDiagnostics({
          buildStage: 'type-checking',
        })
        await startTypeChecking(typeCheckingOptions)
        traceMemoryUsage('Finished type checking', nextBuildSpan)
      }

      const collectingPageDataStart = process.hrtime()
      const postCompileSpinner = createSpinner('Collecting page data')

      const buildManifestPath = path.join(distDir, BUILD_MANIFEST)

      let staticAppPagesCount = 0
      let serverAppPagesCount = 0
      let edgeRuntimeAppCount = 0
      let edgeRuntimePagesCount = 0
      const ssgPages = new Set<string>()
      const ssgStaticFallbackPages = new Set<string>()
      const ssgBlockingFallbackPages = new Set<string>()
      const staticPages = new Set<string>()
      const invalidPages = new Set<string>()
      const serverPropsPages = new Set<string>()
      const additionalPaths = new Map<string, PrerenderedRoute[]>()
      const staticPaths = new Map<string, PrerenderedRoute[]>()
      const appNormalizedPaths = new Map<string, string>()
      const fallbackModes = new Map<string, FallbackMode>()
      const appDefaultConfigs = new Map<string, AppSegmentConfig>()
      const pageInfos: PageInfos = new Map<string, PageInfo>()
      let pagesManifest = await readManifest<PagesManifest>(pagesManifestPath)
      const buildManifest = await readManifest<BuildManifest>(buildManifestPath)

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

      const worker = createStaticWorker(config, { debuggerPortOffset: -1 })

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
        hasNonStaticErrorPage,
      } = await staticCheckSpan.traceAsyncFn(async () => {
        if (isCompileMode) {
          return {
            customAppGetInitialProps: false,
            namedExports: [],
            isNextImageImported: true,
            hasNonStaticErrorPage: hasUserPagesRoutes,
          }
        }

        const { configFileName } = config
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
              cacheComponents: isAppCacheComponentsEnabled,
              authInterrupts: isAuthInterruptsEnabled,
              httpAgentOptions: config.httpAgentOptions,
              locales: config.i18n?.locales,
              defaultLocale: config.i18n?.defaultLocale,
              nextConfigOutput: config.output,
              pprConfig: config.experimental.ppr,
              cacheLifeProfiles: config.cacheLife,
              buildId,
              sriEnabled,
              cacheMaxMemorySize: config.cacheMaxMemorySize,
            })
        )

        const appPageToCheck = '/_app'

        const customAppGetInitialPropsPromise = hasUserPagesRoutes
          ? worker.hasCustomGetInitialProps({
              page: appPageToCheck,
              distDir,
              checkingApp: true,
              sriEnabled,
            })
          : Promise.resolve(false)

        const namedExportsPromise = hasUserPagesRoutes
          ? worker.getDefinedNamedExports({
              page: appPageToCheck,
              distDir,
              sriEnabled,
            })
          : Promise.resolve([])

        // eslint-disable-next-line @typescript-eslint/no-shadow
        let isNextImageImported: boolean | undefined

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

                let isRoutePPREnabled = false
                let isSSG = false
                let isStatic = false
                let isServerComponent = false
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

                const pageFilePath = isAppBuiltinPage(pagePath)
                  ? pagePath
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

                if (staticInfo?.hadUnsupportedValue) {
                  errorFromUnsupportedSegmentConfig()
                }

                // If there's any thing that would contribute to the functions
                // configuration, we need to add it to the manifest.
                if (
                  typeof staticInfo?.runtime !== 'undefined' ||
                  typeof staticInfo?.maxDuration !== 'undefined' ||
                  typeof staticInfo?.preferredRegion !== 'undefined'
                ) {
                  const regions = staticInfo?.preferredRegion
                    ? typeof staticInfo.preferredRegion === 'string'
                      ? [staticInfo.preferredRegion]
                      : staticInfo.preferredRegion
                    : undefined

                  functionsConfigManifest.functions[page] = {
                    maxDuration: staticInfo?.maxDuration,
                    ...(regions && { regions }),
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
                            httpAgentOptions: config.httpAgentOptions,
                            locales: config.i18n?.locales,
                            defaultLocale: config.i18n?.defaultLocale,
                            parentId: isPageStaticSpan.getId(),
                            pageRuntime,
                            edgeInfo,
                            pageType,
                            cacheComponents: isAppCacheComponentsEnabled,
                            authInterrupts: isAuthInterruptsEnabled,
                            cacheHandler: config.cacheHandler,
                            cacheHandlers: config.experimental.cacheHandlers,
                            isrFlushToDisk: ciEnvironment.hasNextSupport
                              ? false
                              : config.experimental.isrFlushToDisk,
                            cacheMaxMemorySize: config.cacheMaxMemorySize,
                            nextConfigOutput: config.output,
                            pprConfig: config.experimental.ppr,
                            cacheLifeProfiles: config.cacheLife,
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
                                  params: {},
                                  pathname: page,
                                  encodedPathname: page,
                                  fallbackRouteParams: [],
                                  fallbackMode:
                                    workerResult.prerenderFallbackMode,
                                  fallbackRootParams: [],
                                  throwOnEmptyStaticShell: true,
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
                          workerResult.isStatic = false
                          workerResult.hasStaticProps = false
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
                  originalAppPath,
                  isStatic,
                  isSSG,
                  isRoutePPREnabled,
                  ssgPageRoutes,
                  initialCacheControl: undefined,
                  runtime: pageRuntime,
                  pageDuration: undefined,
                  ssgPageDurations: undefined,
                  hasEmptyStaticShell: undefined,
                })
              })
            })
        )

        const errorPageResult = await errorPageStaticResult
        const nonStaticErrorPage =
          (await errorPageHasCustomGetInitialProps) ||
          (errorPageResult && errorPageResult.hasServerProps)

        const returnValue = {
          customAppGetInitialProps: await customAppGetInitialPropsPromise,
          namedExports: await namedExportsPromise,
          isNextImageImported,
          hasNonStaticErrorPage: nonStaticErrorPage,
        }

        return returnValue
      })

      if (postCompileSpinner) {
        const collectingPageDataEnd = process.hrtime(collectingPageDataStart)
        postCompileSpinner.setText(
          `Collecting page data in ${hrtimeDurationToString(collectingPageDataEnd)}`
        )
        postCompileSpinner.stopAndPersist()
      }
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
          bundler !== Bundler.Turbopack &&
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
              ...(bundler !== Bundler.Turbopack
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
              ...(pagesDir && bundler !== Bundler.Turbopack
                ? [
                    DYNAMIC_CSS_MANIFEST + '.json',
                    path.join(SERVER_DIRECTORY, DYNAMIC_CSS_MANIFEST + '.js'),
                  ]
                : []),
              BUILD_ID_FILE,
              path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.js'),
              path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.json'),
              SERVER_FILES_MANIFEST,
              ...instrumentationHookEntryFiles,
            ]
              .filter(nonNullable)
              .map((file) => path.join(config.distDir, file)),
            ignore: [] as string[],
          }

          return serverFilesManifest
        })

      const middlewareFile = rootPaths.find(
        (p) => p.includes(MIDDLEWARE_FILENAME) || p.includes(PROXY_FILENAME)
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

        if (staticInfo.hadUnsupportedValue) {
          errorFromUnsupportedSegmentConfig()
        }

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

          if (bundler === Bundler.Turbopack) {
            await writeManifest(
              path.join(
                distDir,
                'static',
                buildId,
                TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST
              ),
              functionsConfigManifest.functions['/_middleware'].matchers || []
            )
          }
        }
      }

      await writeFunctionsConfigManifest(distDir, functionsConfigManifest)

      if (
        bundler !== Bundler.Turbopack &&
        !isGenerateMode &&
        !buildTracesPromise
      ) {
        buildTracesPromise = nextBuildSpan
          .traceChild('collect-build-traces')
          .traceAsyncFn(() => {
            return collectBuildTraces({
              dir,
              config,
              distDir,
              edgeRuntimeRoutes: collectRoutesUsingEdgeRuntime(pageInfos),
              staticPages: [...staticPages],
              nextBuildSpan,
              buildTraceContext,
              outputFileTracingRoot,
            }).catch((err) => {
              console.error(err)
              process.exit(1)
            })
          })
      }

      if (serverPropsPages.size > 0 || ssgPages.size > 0) {
        // We update the routes manifest after the build with the
        // data routes since we can't determine these until after build
        routesManifest.dataRoutes = sortPages([
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

      // Under standalone mode, we need to ensure that the cache entry debug
      // handler is copied so that it can be used in the test. This is required
      // for the turbopack test to run as it's more strict about the build
      // directories. This is only used for testing and is not used in
      // production.
      if (
        process.env.__NEXT_TEST_MODE &&
        process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
      ) {
        requiredServerFilesManifest.files.push(
          path.relative(
            dir,
            path.isAbsolute(process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS)
              ? process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
              : path.join(
                  dir,
                  process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
                )
          )
        )
      }

      const features: EventBuildFeatureUsage[] = [
        {
          featureName: 'experimental/cacheComponents',
          invocationCount: config.cacheComponents ? 1 : 0,
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
        {
          featureName: 'experimental/isolatedDevBuild',
          invocationCount: config.experimental.isolatedDevBuild ? 1 : 0,
        },
        {
          featureName: 'turbopackFileSystemCache',
          invocationCount: isFileSystemCacheEnabledForBuild(config) ? 1 : 0,
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

      // we don't need to inline for turbopack build as
      // it will handle it's own caching separate of compile
      if (isGenerateMode && bundler !== Bundler.Turbopack) {
        Log.info('Inlining static env ...')

        await nextBuildSpan
          .traceChild('inline-static-env')
          .traceAsyncFn(async () => {
            await inlineStaticEnv({
              distDir,
              config,
            })
          })
      }

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

      const hasPages500 = !appDirOnly && usedStaticStatusPages.includes('/500')
      const useDefaultStatic500 =
        !hasPages500 && !hasNonStaticErrorPage && !customAppGetInitialProps

      const combinedPages = [...staticPages, ...ssgPages]
      const isApp404Static = staticPaths.has(UNDERSCORE_NOT_FOUND_ROUTE_ENTRY)
      const hasStaticApp404 = hasApp404 && isApp404Static
      const isAppGlobalErrorStatic = staticPaths.has(
        UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
      )
      const hasStaticAppGlobalError =
        hasAppGlobalError && isAppGlobalErrorStatic

      await updateBuildDiagnostics({
        buildStage: 'static-generation',
      })

      const hasGSPAndRevalidateZero = new Set<string>()

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

          const sortedStaticPaths = Array.from(staticPaths.entries()).sort(
            ([a], [b]) => a.localeCompare(b)
          )

          const exportApp = (require('../export') as typeof import('../export'))
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

              if (useStaticPages404 && !appDirOnly) {
                defaultMap['/404'] = {
                  page: hasPages404 ? '/404' : '/_error',
                }
              }

              if (useDefaultStatic500 && !appDirOnly) {
                defaultMap['/500'] = {
                  page: '/_error',
                }
              }

              // TODO: output manifest specific to app paths and their
              // revalidate periods and dynamicParams settings
              sortedStaticPaths.forEach(([originalAppPath, routes]) => {
                const appConfig = appDefaultConfigs.get(originalAppPath)
                const isDynamicError = appConfig?.dynamic === 'error'

                const isRoutePPREnabled: boolean = appConfig
                  ? checkIsRoutePPREnabled(config.experimental.ppr)
                  : false

                routes.forEach((route) => {
                  // If the route has any dynamic root segments, we need to skip
                  // rendering the route. This is because we don't support
                  // revalidating the shells without the parameters present.
                  // Note that we only have fallback root params if we also have
                  // PPR enabled for this route/app already.
                  if (
                    route.fallbackRootParams &&
                    route.fallbackRootParams.length > 0 &&
                    // We don't skip rendering the route if we have the
                    // following enabled. This is because the flight data now
                    // does not contain any of the route params and is instead
                    // completely static.
                    !(
                      config.experimental.clientSegmentCache &&
                      config.cacheComponents
                    )
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
                    _allowEmptyStaticShell: !route.throwOnEmptyStaticShell,
                  }
                })
              })

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
              debugPrerender,
              pages: combinedPages,
              outdir,
              statusMessage: 'Generating static pages',
              numWorkers: getNumberOfWorkers(exportConfig),
              appDirOnly,
            },
            nextBuildSpan
          )

          // If there was no result, there's nothing more to do.
          if (!exportResult) return

          const getFallbackMode = (route: PrerenderedRoute) => {
            const hasEmptyStaticShell = exportResult.byPath.get(
              route.pathname
            )?.hasEmptyStaticShell

            // If the route has an empty static shell and is not configured to
            // throw on empty static shell, then we should use the blocking
            // static render mode.
            if (
              hasEmptyStaticShell &&
              !route.throwOnEmptyStaticShell &&
              route.fallbackMode === FallbackMode.PRERENDER
            ) {
              return FallbackMode.BLOCKING_STATIC_RENDER
            }

            // If the route has no fallback mode, then we should use the
            // `NOT_FOUND` fallback mode.
            if (!route.fallbackMode) {
              return FallbackMode.NOT_FOUND
            }

            return route.fallbackMode
          }

          const getCacheControl = (
            exportPath: string,
            defaultRevalidate: Revalidate = false
          ): CacheControl => {
            const cacheControl =
              exportResult.byPath.get(exportPath)?.cacheControl

            if (!cacheControl) {
              return { revalidate: defaultRevalidate, expire: undefined }
            }

            if (
              cacheControl.revalidate !== false &&
              cacheControl.revalidate > 0 &&
              cacheControl.expire === undefined
            ) {
              return {
                revalidate: cacheControl.revalidate,
                expire: config.expireTime,
              }
            }

            return cacheControl
          }

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

          sortedStaticPaths.forEach(([originalAppPath, prerenderedRoutes]) => {
            const page = appNormalizedPaths.get(originalAppPath)
            if (!page) throw new InvariantError('Page not found')

            const appConfig = appDefaultConfigs.get(originalAppPath)
            if (!appConfig) throw new InvariantError('App config not found')

            const ssgPageRoutesSet = new Set(pageInfos.get(page)?.ssgPageRoutes)

            let hasRevalidateZero =
              appConfig.revalidate === 0 ||
              getCacheControl(page).revalidate === 0

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
              checkIsRoutePPREnabled(config.experimental.ppr)
                ? true
                : undefined

            const htmlBotsRegexString =
              // The htmlLimitedBots has been converted to a string during loadConfig
              config.htmlLimitedBots || HTML_LIMITED_BOT_UA_RE_STRING

            // this flag is used to selectively bypass the static cache and invoke the lambda directly
            // to enable server actions on static routes
            const bypassFor: RouteHas[] = [
              { type: 'header', key: ACTION_HEADER },
              {
                type: 'header',
                key: 'content-type',
                value: 'multipart/form-data;.*',
              },
              // If it's PPR rendered non-static page, bypass the PPR cache when streaming metadata is enabled.
              // This will skip the postpone data for those bots requests and instead produce a dynamic render.
              ...(isRoutePPREnabled
                ? [
                    {
                      type: 'header',
                      key: 'user-agent',
                      value: htmlBotsRegexString,
                    },
                  ]
                : []),
            ]

            // We should collect all the dynamic routes into a single array for
            // this page. Including the full fallback route (the original
            // route), any routes that were generated with unknown route params
            // should be collected and included in the dynamic routes part
            // of the manifest instead.
            const staticPrerenderedRoutes: PrerenderedRoute[] = []
            const dynamicPrerenderedRoutes: PrerenderedRoute[] = []

            // Sort the outputted routes to ensure consistent output. Any route
            // though that has unknown route params will be pulled and sorted
            // independently. This is because the routes with unknown route
            // params will contain the dynamic path parameters, some of which
            // may conflict with the actual prerendered routes.
            const unsortedUnknownPrerenderRoutes: PrerenderedRoute[] = []
            const unsortedKnownPrerenderRoutes: PrerenderedRoute[] = []
            for (const prerenderedRoute of prerenderedRoutes) {
              if (
                prerenderedRoute.fallbackRouteParams &&
                prerenderedRoute.fallbackRouteParams.length > 0
              ) {
                unsortedUnknownPrerenderRoutes.push(prerenderedRoute)
              } else {
                unsortedKnownPrerenderRoutes.push(prerenderedRoute)
              }
            }

            const sortedUnknownPrerenderRoutes = sortPageObjects(
              unsortedUnknownPrerenderRoutes,
              (prerenderedRoute) => prerenderedRoute.pathname
            )
            const sortedKnownPrerenderRoutes = sortPageObjects(
              unsortedKnownPrerenderRoutes,
              (prerenderedRoute) => prerenderedRoute.pathname
            )

            prerenderedRoutes = [
              ...sortedKnownPrerenderRoutes,
              ...sortedUnknownPrerenderRoutes,
            ]

            for (const prerenderedRoute of prerenderedRoutes) {
              if (
                isRoutePPREnabled &&
                prerenderedRoute.fallbackRouteParams &&
                prerenderedRoute.fallbackRouteParams.length > 0
              ) {
                // If the route has unknown params, then we need to add it to
                // the list of dynamic routes.
                dynamicPrerenderedRoutes.push(prerenderedRoute)
              } else {
                // If the route doesn't have unknown params, then we need to
                // add it to the list of static routes.
                staticPrerenderedRoutes.push(prerenderedRoute)
              }
            }

            // Handle all the static routes.
            for (const route of staticPrerenderedRoutes) {
              if (isDynamicRoute(page) && route.pathname === page) continue

              const {
                metadata = {},
                hasEmptyStaticShell,
                hasPostponed,
              } = exportResult.byPath.get(route.pathname) ?? {}

              const cacheControl = getCacheControl(
                route.pathname,
                appConfig.revalidate
              )

              pageInfos.set(route.pathname, {
                ...(pageInfos.get(route.pathname) as PageInfo),
                hasPostponed,
                hasEmptyStaticShell,
                initialCacheControl: cacheControl,
              })

              // update the page (eg /blog/[slug]) to also have the postpone metadata
              pageInfos.set(page, {
                ...(pageInfos.get(page) as PageInfo),
                hasPostponed,
                hasEmptyStaticShell,
                initialCacheControl: cacheControl,
              })

              if (cacheControl.revalidate !== 0) {
                const normalizedRoute = normalizePagePath(route.pathname)

                let dataRoute: string | null
                if (isAppRouteHandler) {
                  dataRoute = null
                } else {
                  dataRoute = path.posix.join(`${normalizedRoute}${RSC_SUFFIX}`)
                }

                let prefetchDataRoute: string | null = null
                // While we may only write the `.rsc` when the route does not
                // have PPR enabled, we still want to generate the route when
                // deployed so it doesn't 404. If the app has PPR enabled, we
                // should add this key.
                if (
                  !isAppRouteHandler &&
                  isAppPPREnabled &&
                  // Don't add a prefetch data route if we have both
                  // clientSegmentCache and clientParamParsing enabled. This is
                  // because we don't actually use the prefetch data route in
                  // this case. This only applies if we have PPR enabled for
                  // this route.
                  !(
                    config.experimental.clientSegmentCache &&
                    config.cacheComponents &&
                    isRoutePPREnabled
                  )
                ) {
                  prefetchDataRoute = path.posix.join(
                    `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                  )
                }

                const meta = collectMeta(metadata)
                const status =
                  route.pathname === UNDERSCORE_NOT_FOUND_ROUTE
                    ? 404
                    : meta.status

                prerenderManifest.routes[route.pathname] = {
                  initialStatus: status,
                  initialHeaders: meta.headers,
                  renderingMode: isAppPPREnabled
                    ? isRoutePPREnabled
                      ? RenderingMode.PARTIALLY_STATIC
                      : RenderingMode.STATIC
                    : undefined,
                  experimentalPPR: isRoutePPREnabled,
                  experimentalBypassFor: bypassFor,
                  initialRevalidateSeconds: cacheControl.revalidate,
                  initialExpireSeconds: cacheControl.expire,
                  srcRoute: page,
                  dataRoute,
                  prefetchDataRoute,
                  allowHeader: ALLOWED_HEADERS,
                }
              } else {
                hasRevalidateZero = true

                if (ssgPageRoutesSet.has(route.pathname)) {
                  const pageInfo = pageInfos.get(page) as PageInfo
                  // Remove the route from the SSG page routes if it bailed out
                  // during prerendering.
                  ssgPageRoutesSet.delete(route.pathname)

                  // Mark the route as having a GSP and revalidate zero.
                  if (ssgPageRoutesSet.size === 0) {
                    hasGSPAndRevalidateZero.delete(page)
                  } else {
                    hasGSPAndRevalidateZero.add(page)
                  }

                  pageInfos.set(page, {
                    ...pageInfo,
                    ssgPageRoutes: Array.from(ssgPageRoutesSet),
                    // If there are no SSG page routes left, then the page is not SSG.
                    isSSG: ssgPageRoutesSet.size === 0 ? false : pageInfo.isSSG,
                  })
                } else {
                  // we might have determined during prerendering that this page
                  // used dynamic data
                  pageInfos.set(route.pathname, {
                    ...(pageInfos.get(route.pathname) as PageInfo),
                    isSSG: false,
                    isStatic: false,
                  })
                }
              }
            }

            if (!hasRevalidateZero && isDynamicRoute(page)) {
              // When PPR fallbacks aren't used, we need to include it here. If
              // they are enabled, then it'll already be included in the
              // prerendered routes.
              if (!isRoutePPREnabled) {
                dynamicPrerenderedRoutes.push({
                  params: {},
                  pathname: page,
                  encodedPathname: page,
                  fallbackRouteParams: [],
                  fallbackMode:
                    fallbackModes.get(originalAppPath) ??
                    FallbackMode.NOT_FOUND,
                  fallbackRootParams: [],
                  throwOnEmptyStaticShell: true,
                })
              }

              for (const route of dynamicPrerenderedRoutes) {
                const normalizedRoute = normalizePagePath(route.pathname)

                const metadata = exportResult.byPath.get(
                  route.pathname
                )?.metadata

                const cacheControl = getCacheControl(route.pathname)

                let dataRoute: string | null = null
                if (!isAppRouteHandler) {
                  dataRoute = path.posix.join(`${normalizedRoute}${RSC_SUFFIX}`)
                }

                let prefetchDataRoute: string | null = null
                let dynamicRoute = routesManifest.dynamicRoutes.find(
                  (r) => r.page === route.pathname
                )
                if (!isAppRouteHandler && isAppPPREnabled) {
                  if (
                    // Don't add a prefetch data route if we have both
                    // clientSegmentCache and clientParamParsing enabled. This is
                    // because we don't actually use the prefetch data route in
                    // this case. This only applies if we have PPR enabled for
                    // this route.
                    !config.experimental.clientSegmentCache ||
                    !config.cacheComponents ||
                    !isRoutePPREnabled
                  ) {
                    prefetchDataRoute = path.posix.join(
                      `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                    )
                  }

                  // If the dynamic route wasn't found, then we need to create
                  // it. This ensures that for each fallback shell there's an
                  // entry in the app routes manifest which enables routing for
                  // this fallback shell.
                  if (!dynamicRoute) {
                    dynamicRoute = pageToRoute(route.pathname, page)
                    sourcePages.set(route.pathname, page)

                    // This route is not for the internal router, but instead
                    // for external routers.
                    dynamicRoute.skipInternalRouting = true

                    // Push this to the end of the array. The dynamic routes are
                    // sorted by page later.
                    dynamicRoutes.push(dynamicRoute)
                  }
                }

                if (
                  !isAppRouteHandler &&
                  (metadata?.segmentPaths ||
                    (route.fallbackRootParams &&
                      route.fallbackRootParams.length > 0))
                ) {
                  // If PPR isn't enabled, then we might not find the dynamic
                  // route by pathname. If that's the case, we need to find the
                  // route by page.
                  if (!dynamicRoute) {
                    dynamicRoute = dynamicRoutes.find((r) => r.page === page)

                    // If it can't be found by page, we must throw an error.
                    if (!dynamicRoute) {
                      throw new InvariantError('Dynamic route not found')
                    }
                  }

                  if (metadata?.segmentPaths) {
                    const pageSegmentPath = metadata.segmentPaths.find((item) =>
                      item.endsWith('__PAGE__')
                    )
                    if (!pageSegmentPath) {
                      throw new Error(`Invariant: missing __PAGE__ segmentPath`)
                    }

                    // We build a combined segment data route from the
                    // page segment as we need to limit the number of
                    // routes we output and they can be shared
                    const builtSegmentDataRoute = buildPrefetchSegmentDataRoute(
                      route.pathname,
                      pageSegmentPath
                    )

                    builtSegmentDataRoute.source =
                      builtSegmentDataRoute.source.replace(
                        '/__PAGE__\\.segment\\.rsc$',
                        `(?<segment>/__PAGE__\\.segment\\.rsc|\\.segment\\.rsc)(?:/)?$`
                      )
                    builtSegmentDataRoute.destination =
                      builtSegmentDataRoute.destination.replace(
                        '/__PAGE__.segment.rsc',
                        '$segment'
                      )
                    dynamicRoute.prefetchSegmentDataRoutes ??= []
                    dynamicRoute.prefetchSegmentDataRoutes.push(
                      builtSegmentDataRoute
                    )
                  }
                  // If the route has fallback root params, and we don't have
                  // any segment paths, we need to write the inverse prefetch
                  // segment data route so that it can first rewrite the /_tree
                  // request to the prefetch RSC route. We also need to set the
                  // `hasFallbackRootParams` flag so that we can simplify the
                  // route regex for matching.
                  else if (
                    route.fallbackRootParams &&
                    route.fallbackRootParams.length > 0
                  ) {
                    dynamicRoute.hasFallbackRootParams = true
                    dynamicRoute.prefetchSegmentDataRoutes = [
                      buildInversePrefetchSegmentDataRoute(
                        dynamicRoute.page,
                        // We use the special segment path of `/_tree` because it's
                        // the first one sent by the client router so it's the only
                        // one we need to rewrite to the regular prefetch RSC route.
                        '/_tree'
                      ),
                    ]
                  }
                }

                pageInfos.set(route.pathname, {
                  ...(pageInfos.get(route.pathname) as PageInfo),
                  isDynamicAppRoute: true,
                  // if PPR is turned on and the route contains a dynamic segment,
                  // we assume it'll be partially prerendered
                  hasPostponed: isRoutePPREnabled,
                })

                const fallbackMode = getFallbackMode(route)

                // When the route is configured to serve a prerender, we should
                // use the cache control from the export result. If it can't be
                // found, mark that we should keep the shell forever
                // (revalidate: `false` via `getCacheControl()`).
                const fallbackCacheControl =
                  isRoutePPREnabled && fallbackMode === FallbackMode.PRERENDER
                    ? cacheControl
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
                  fallbackRevalidate: fallbackCacheControl?.revalidate,
                  fallbackExpire: fallbackCacheControl?.expire,
                  fallbackStatus: meta.status,
                  fallbackHeaders: meta.headers,
                  fallbackRootParams: fallback
                    ? route.fallbackRootParams
                    : undefined,
                  fallbackSourceRoute:
                    route.fallbackRouteParams &&
                    route.fallbackRouteParams.length > 0
                      ? page
                      : undefined,
                  fallbackRouteParams: route.fallbackRouteParams,
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
                  // if 404.html folder doesn't exist, create it
                  await fs.mkdir(
                    path.dirname(
                      path.join(distDir, 'server', updatedRelativeDest)
                    ),
                    { recursive: true }
                  )
                  await fs.copyFile(
                    orig,
                    path.join(distDir, 'server', updatedRelativeDest)
                  )

                  // since the app router not found is prioritized over pages router,
                  // we have to ensure the app router entries are available for all locales
                  if (i18n) {
                    for (const locale of i18n.locales) {
                      const curPath = `/${locale}/404`
                      pagesManifest[curPath] = updatedRelativeDest
                    }
                  }

                  pagesManifest['/404'] = updatedRelativeDest
                }
              })
          }

          async function moveExportedAppGlobalErrorTo500() {
            return staticGenerationSpan
              .traceChild('move-exported-app-global-error-')
              .traceAsyncFn(async () => {
                // If static 500.html exists in pages router, don't move it
                if (
                  existsSync(path.join(distDir, 'server', 'pages', '500.html'))
                ) {
                  return
                }

                // Only handle 500.html generation for static export
                const orig = path.join(
                  distDir,
                  'server',
                  'app',
                  '_global-error.html'
                )
                if (existsSync(orig)) {
                  const error500Html = path.join(
                    distDir,
                    'server',
                    'pages',
                    '500.html'
                  )

                  // if 500.html folder doesn't exist, create it
                  await fs.mkdir(path.dirname(error500Html), {
                    recursive: true,
                  })
                  await fs.copyFile(orig, error500Html)

                  pagesManifest['/500'] = path
                    .join('pages', '500.html')
                    .replace(/\\/g, '/')
                }
              })
          }

          // If there's /not-found inside app, we prefer it over the pages 404
          if (hasStaticApp404) {
            await moveExportedAppNotFoundTo404()
          } else {
            // Only move /404 to /404 when there is no custom 404 as in that case we don't know about the 404 page
            if (
              !hasPages404 &&
              !hasApp404 &&
              useStaticPages404 &&
              !appDirOnly
            ) {
              await moveExportedPage('/_error', '/404', '/404', false, 'html')
            }
          }

          if (useDefaultStatic500 && !appDirOnly) {
            await moveExportedPage('/_error', '/500', '/500', false, 'html')
          }

          // If there's app router and no pages router, use app router built-in 500.html
          if (
            hasStaticAppGlobalError &&
            mappedAppPages &&
            Object.keys(mappedAppPages).length > 0
          ) {
            await moveExportedAppGlobalErrorTo500()
          }

          for (const page of combinedPages) {
            const isSsg = ssgPages.has(page)
            const isStaticSsgFallback = ssgStaticFallbackPages.has(page)
            const isDynamic = isDynamicRoute(page)
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

            if (isSsg) {
              // For a non-dynamic SSG page, we must copy its data file
              // from export, we already moved the HTML file above
              if (!isDynamic) {
                await moveExportedPage(page, page, file, isSsg, 'json')

                if (i18n) {
                  // TODO: do we want to show all locale variants in build output
                  for (const locale of i18n.locales) {
                    const localePage = `/${locale}${page === '/' ? '' : page}`

                    const cacheControl = getCacheControl(localePage)

                    prerenderManifest.routes[localePage] = {
                      initialRevalidateSeconds: cacheControl.revalidate,
                      initialExpireSeconds: cacheControl.expire,
                      experimentalPPR: undefined,
                      renderingMode: undefined,
                      srcRoute: null,
                      dataRoute: path.posix.join(
                        '/_next/data',
                        buildId,
                        `${localePage}.json`
                      ),
                      prefetchDataRoute: undefined,
                      allowHeader: ALLOWED_HEADERS,
                    }
                  }
                } else {
                  const cacheControl = getCacheControl(page)

                  prerenderManifest.routes[page] = {
                    initialRevalidateSeconds: cacheControl.revalidate,
                    initialExpireSeconds: cacheControl.expire,
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
                if (pageInfo) {
                  pageInfo.initialCacheControl = getCacheControl(page)
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

                  const cacheControl = getCacheControl(route.pathname)

                  prerenderManifest.routes[route.pathname] = {
                    initialRevalidateSeconds: cacheControl.revalidate,
                    initialExpireSeconds: cacheControl.expire,
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

                  if (pageInfo) {
                    pageInfo.initialCacheControl = cacheControl
                  }
                }
              }
            }
          }

          // remove temporary export folder
          await fs.rm(outdir, { recursive: true, force: true })
          await writeManifest(pagesManifestPath, pagesManifest)
        })

        // As we may have modified the dynamicRoutes, we need to sort the
        // dynamic routes by page.
        routesManifest.dynamicRoutes = sortSortableRouteObjects(
          dynamicRoutes,
          (route) => ({
            // If the route is PPR enabled, and has an associated source page,
            // use it. Otherwise fallback to the page which should be the same.
            sourcePage: sourcePages.get(route.page) ?? route.page,
            page: route.page,
          })
        )

        // Now write the routes manifest out.
        await nextBuildSpan
          .traceChild('write-routes-manifest')
          .traceAsyncFn(() => writeManifest(routesManifestPath, routesManifest))
      }

      const finalizingPageOptimizationStart = process.hrtime()
      const postBuildSpinner = createSpinner('Finalizing page optimization')
      let buildTracesSpinner
      let buildTracesStart
      if (buildTracesPromise) {
        buildTracesStart = process.hrtime()
        buildTracesSpinner = createSpinner('Collecting build traces')
      }

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
          middlewareCount: hasMiddlewareFile || hasProxyFile ? 1 : 0,
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
            fallbackExpire: undefined,
            fallbackSourceRoute: undefined,
            fallbackRootParams: undefined,
            fallbackRouteParams: undefined,
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
        if (buildTracesStart) {
          const buildTracesEnd = process.hrtime(buildTracesStart)
          buildTracesSpinner.setText(
            `Collecting build traces in ${hrtimeDurationToString(buildTracesEnd)}`
          )
        }
        buildTracesSpinner.stopAndPersist()
        buildTracesSpinner = undefined
      }

      if (isCompileMode) {
        Log.info(
          `Build ran with "compile" mode, to finalize the build run either "generate" or "generate-env" mode as well`
        )
      }

      if (config.output === 'export') {
        await nextBuildSpan
          .traceChild('output-export-full-static-export')
          .traceAsyncFn(async () => {
            await writeFullyStaticExport(
              config,
              dir,
              enabledDirectories,
              configOutDir,
              nextBuildSpan,
              appDirOnly
            )
          })
      }

      // This should come after output: export handling but before
      // output: standalone, in the future output: standalone might
      // not be allowed if an adapter with onBuildComplete is configured
      const adapterPath = config.experimental.adapterPath
      if (adapterPath) {
        await nextBuildSpan
          .traceChild('adapter-handle-build-complete')
          .traceAsyncFn(async () => {
            await handleBuildComplete({
              dir,
              distDir,
              config,
              configOutDir: path.join(dir, configOutDir),
              staticPages,
              nextVersion: process.env.__NEXT_VERSION as string,
              tracingRoot: outputFileTracingRoot,
              hasNodeMiddleware,
              hasInstrumentationHook,
              adapterPath,
              pageKeys: pageKeys.pages,
              appPageKeys: denormalizedAppPages,
              routesManifest,
              prerenderManifest,
              middlewareManifest,
              functionsConfigManifest,
              hasStatic404: useStaticPages404,
              requiredServerFiles: requiredServerFilesManifest.files,
            })
          })
      }

      if (config.output === 'standalone') {
        await nextBuildSpan
          .traceChild('output-standalone')
          .traceAsyncFn(async () => {
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
          })
      }

      if (postBuildSpinner) {
        const finalizingPageOptimizationEnd = process.hrtime(
          finalizingPageOptimizationStart
        )
        postBuildSpinner.setText(
          `Finalizing page optimization in ${hrtimeDurationToString(finalizingPageOptimizationEnd)}`
        )
        postBuildSpinner.stopAndPersist()
      }
      console.log()

      if (debugOutput) {
        nextBuildSpan
          .traceChild('print-custom-routes')
          .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
      }

      await nextBuildSpan.traceChild('print-tree-view').traceAsyncFn(() =>
        printTreeView(pageKeys, pageInfos, {
          pagesDir,
          useStaticPages404,
          pageExtensions: config.pageExtensions,
          buildManifest,
          middlewareManifest,
          hasGSPAndRevalidateZero,
        })
      )

      await nextBuildSpan
        .traceChild('telemetry-flush')
        .traceAsyncFn(() => telemetry.flush())

      await shutdownPromise
    })
  } catch (e) {
    const telemetry: Telemetry | undefined = traceGlobals.get('telemetry')
    if (telemetry) {
      telemetry.record(
        eventBuildFailed({
          bundler: getBundlerForTelemetry(bundler),
          errorCode: getErrorCodeForTelemetry(e),
          durationInSeconds: Math.floor((Date.now() - buildStartTime) / 1000),
        })
      )
    }
    throw e
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
        isTurboSession: bundler === Bundler.Turbopack,
        sync: true,
      })
    }
  }
}

function errorFromUnsupportedSegmentConfig(): never {
  Log.error(
    `Invalid segment configuration export detected. This can cause unexpected behavior from the configs not being applied. You should see the relevant failures in the logs above. Please fix them to continue.`
  )
  process.exit(1)
}

function getBundlerForTelemetry(bundler: Bundler) {
  switch (bundler) {
    case Bundler.Turbopack:
      return 'turbopack'
    case Bundler.Rspack:
      return 'rspack'
    case Bundler.Webpack:
      return 'webpack'
    default:
      throw new Error(`unknown bundler: ${bundler}`)
  }
}

function getErrorCodeForTelemetry(err: unknown) {
  const code = extractNextErrorCode(err)
  if (code != null) {
    return code
  }

  if (err instanceof Error && 'code' in err && typeof err.code === 'string') {
    return err.code
  }

  if (err instanceof Error) {
    return err.name
  }

  return 'Unknown'
}
