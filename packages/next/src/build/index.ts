import type { RemotePattern } from '../shared/lib/image-config'
import type { AppBuildManifest } from './webpack/plugins/app-build-manifest-plugin'
import type { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import type { ActionManifest } from './webpack/plugins/flight-client-entry-plugin'
import type { ExportAppOptions, ExportAppWorker } from '../export/types'
import type { Revalidate } from '../server/lib/revalidate'

import '../lib/setup-exception-listeners'

import { loadEnvConfig } from '@next/env'
import { bold, yellow, green } from '../lib/picocolors'
import crypto from 'crypto'
import { isMatch, makeRe } from 'next/dist/compiled/micromatch'
import { existsSync, promises as fs } from 'fs'
import os from 'os'
import { Worker } from '../lib/worker'
import { defaultConfig } from '../server/config-shared'
import devalue from 'next/dist/compiled/devalue'
import findUp from 'next/dist/compiled/find-up'
import { nanoid } from 'next/dist/compiled/nanoid/index.cjs'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import path from 'path'
import {
  STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
  MIDDLEWARE_FILENAME,
  PAGES_DIR_ALIAS,
  INSTRUMENTATION_HOOK_FILENAME,
  RSC_PREFETCH_SUFFIX,
  RSC_SUFFIX,
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
  RouteType,
} from '../lib/load-custom-routes'
import { getRedirectStatus, modifyRouteRegex } from '../lib/redirect-status'
import { nonNullable } from '../lib/non-nullable'
import { recursiveDelete } from '../lib/recursive-delete'
import { verifyPartytownSetup } from '../lib/verify-partytown-setup'
import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  EXPORT_DETAIL,
  EXPORT_MARKER,
  FONT_MANIFEST,
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
} from '../shared/lib/constants'
import { getSortedRoutes, isDynamicRoute } from '../shared/lib/router/utils'
import type { __ApiPreviewProps } from '../server/api-utils'
import loadConfig from '../server/config'
import type { BuildManifest } from '../server/get-page-files'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getPagePath } from '../server/require'
import * as ciEnvironment from '../telemetry/ci-info'

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
import {
  isDynamicMetadataRoute,
  getPageStaticInfo,
} from './analysis/get-page-static-info'
import { createPagesMapping, getPageFilePath, sortByPageExts } from './entries'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import * as Log from './output/log'
import createSpinner from './spinner'
import { trace, flushAllTraces, setGlobal } from '../trace'
import {
  detectConflictingPaths,
  computeFromManifest,
  getJsPageSizeInKb,
  printCustomRoutes,
  printTreeView,
  copyTracedFiles,
  isReservedPage,
  isAppBuiltinNotFoundPage,
  serializePageInfos,
} from './utils'
import type { PageInfo, PageInfos, AppConfig } from './utils'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import isError from '../lib/is-error'
import type { NextError } from '../lib/is-error'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveReadDir } from '../lib/recursive-readdir'
import {
  lockfilePatchPromise,
  teardownTraceSubscriber,
  teardownCrashReporter,
  loadBindings,
  teardownHeapProfiler,
  createDefineEnv,
} from './swc'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import { getFilesInDir } from '../lib/get-files-in-dir'
import { eventSwcPlugins } from '../telemetry/events/swc-plugins'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import {
  ACTION,
  NEXT_ROUTER_PREFETCH_HEADER,
  RSC_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  RSC_VARY_HEADER,
  NEXT_DID_POSTPONE_HEADER,
} from '../client/components/app-router-headers'
import { webpackBuild } from './webpack-build'
import { NextBuildContext } from './build-context'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { createClientRouterFilter } from '../lib/create-client-router-filter'
import { createValidFileMatcher } from '../server/lib/find-page-file'
import { startTypeChecking } from './type-check'
import { generateInterceptionRoutesRewrites } from '../lib/generate-interception-routes-rewrites'

import { buildDataRoute } from '../server/lib/router-utils/build-data-route'
import { initialize as initializeIncrementalCache } from '../server/lib/incremental-cache-server'
import { nodeFs } from '../server/lib/node-fs-methods'
import { collectBuildTraces } from './collect-build-traces'
import type { BuildTraceContext } from './webpack/plugins/next-trace-entrypoints-plugin'
import { formatManifest } from './manifests/formatter/format-manifest'
import { getStartServerInfo, logStartInfo } from '../server/lib/app-info-log'
import type { NextEnabledDirectories } from '../server/base-server'
import { hasCustomExportOutput } from '../export/utils'

interface ExperimentalBypassForInfo {
  experimentalBypassFor?: RouteHas[]
}

interface ExperimentalPPRInfo {
  experimentalPPR: boolean | undefined
}

interface DataRouteRouteInfo {
  dataRoute: string | null
  prefetchDataRoute: string | null | undefined
}

export interface SsgRoute
  extends ExperimentalBypassForInfo,
    DataRouteRouteInfo,
    ExperimentalPPRInfo {
  initialRevalidateSeconds: Revalidate
  srcRoute: string | null
  initialStatus?: number
  initialHeaders?: Record<string, string>
}

export interface DynamicSsgRoute
  extends ExperimentalBypassForInfo,
    DataRouteRouteInfo,
    ExperimentalPPRInfo {
  fallback: string | null | false
  routeRegex: string
  dataRouteRegex: string | null
  prefetchDataRouteRegex: string | null | undefined
}

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
}

export type ManifestDataRoute = {
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
    domains?: Array<{
      http?: true
      domain: string
      locales?: string[]
      defaultLocale: string
    }>
    locales: string[]
    defaultLocale: string
    localeDetection?: false
  }
  rsc: {
    header: typeof RSC_HEADER
    didPostponeHeader: typeof NEXT_DID_POSTPONE_HEADER
    varyHeader: typeof RSC_VARY_HEADER
    prefetchHeader: typeof NEXT_ROUTER_PREFETCH_HEADER
    suffix: typeof RSC_SUFFIX
    prefetchSuffix: typeof RSC_PREFETCH_SUFFIX
  }
  skipMiddlewareUrlNormalize?: boolean
  caseSensitive?: boolean
}

export function buildCustomRoute(
  type: 'header',
  route: Header
): ManifestHeaderRoute
export function buildCustomRoute(
  type: 'rewrite',
  route: Rewrite
): ManifestRewriteRoute
export function buildCustomRoute(
  type: 'redirect',
  route: Redirect,
  restrictedRedirectPaths: string[]
): ManifestRedirectRoute
export function buildCustomRoute(
  type: RouteType,
  route: Redirect | Rewrite | Header,
  restrictedRedirectPaths?: string[]
): ManifestHeaderRoute | ManifestRewriteRoute | ManifestRedirectRoute {
  const compiled = pathToRegexp(route.source, [], {
    strict: true,
    sensitive: false,
    delimiter: '/', // default is `/#?`, but Next does not pass query info
  })

  let source = compiled.source
  if (!route.internal) {
    source = modifyRouteRegex(
      source,
      type === 'redirect' ? restrictedRedirectPaths : undefined
    )
  }

  const regex = normalizeRouteRegex(source)

  if (type !== 'redirect') {
    return { ...route, regex }
  }

  return {
    ...route,
    statusCode: getRedirectStatus(route as Redirect),
    permanent: undefined,
    regex,
  }
}

async function generateClientSsgManifest(
  prerenderManifest: PrerenderManifest,
  {
    buildId,
    distDir,
    locales,
  }: { buildId: string; distDir: string; locales: string[] }
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

  await fs.writeFile(
    path.join(distDir, CLIENT_STATIC_FILES_PATH, buildId, '_ssgManifest.js'),
    clientSsgManifestContent
  )
}

function pageToRoute(page: string) {
  const routeRegex = getNamedRouteRegex(page, true)
  return {
    page,
    regex: normalizeRouteRegex(routeRegex.re.source),
    routeKeys: routeRegex.routeKeys,
    namedRegex: routeRegex.namedRegex,
  }
}

export default async function build(
  dir: string,
  reactProductionProfiling = false,
  debugOutput = false,
  runLint = true,
  noMangling = false,
  appDirOnly = false,
  turboNextBuild = false,
  turboNextBuildRoot = null,
  buildMode: 'default' | 'experimental-compile' | 'experimental-generate'
): Promise<void> {
  const isCompileMode = buildMode === 'experimental-compile'
  const isGenerateMode = buildMode === 'experimental-generate'

  try {
    const nextBuildSpan = trace('next-build', undefined, {
      buildMode: buildMode,
      isTurboBuild: String(turboNextBuild),
      version: process.env.__NEXT_VERSION as string,
    })

    NextBuildContext.nextBuildSpan = nextBuildSpan
    NextBuildContext.dir = dir
    NextBuildContext.appDirOnly = appDirOnly
    NextBuildContext.reactProductionProfiling = reactProductionProfiling
    NextBuildContext.noMangling = noMangling

    const buildResult = await nextBuildSpan.traceAsyncFn(async () => {
      // attempt to load global env values so they are available in next.config.js
      const { loadedEnvFiles } = nextBuildSpan
        .traceChild('load-dotenv')
        .traceFn(() => loadEnvConfig(dir, false, Log))
      NextBuildContext.loadedEnvFiles = loadedEnvFiles

      const config: NextConfigComplete = await nextBuildSpan
        .traceChild('load-next-config')
        .traceAsyncFn(() =>
          loadConfig(PHASE_PRODUCTION_BUILD, dir, {
            // Log for next.config loading process
            silent: false,
          })
        )

      process.env.NEXT_DEPLOYMENT_ID = config.experimental.deploymentId || ''
      NextBuildContext.config = config

      let configOutDir = 'out'
      if (hasCustomExportOutput(config)) {
        configOutDir = config.distDir
        config.distDir = '.next'
      }
      const distDir = path.join(dir, config.distDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      setGlobal('distDir', distDir)

      let buildId: string = ''

      if (isGenerateMode) {
        buildId = await fs.readFile(path.join(distDir, 'BUILD_ID'), 'utf8')
      } else {
        buildId = await nextBuildSpan
          .traceChild('generate-buildid')
          .traceAsyncFn(() => generateBuildId(config.generateBuildId, nanoid))
      }
      NextBuildContext.buildId = buildId

      const customRoutes: CustomRoutes = await nextBuildSpan
        .traceChild('load-custom-routes')
        .traceAsyncFn(() => loadCustomRoutes(config))

      const { headers, rewrites, redirects } = customRoutes
      NextBuildContext.rewrites = rewrites
      NextBuildContext.originalRewrites = config._originalRewrites
      NextBuildContext.originalRedirects = config._originalRedirects

      const cacheDir = path.join(distDir, 'cache')
      if (ciEnvironment.isCI && !ciEnvironment.hasNextSupport) {
        const hasCache = existsSync(cacheDir)

        if (!hasCache) {
          // Intentionally not piping to stderr in case people fail in CI when
          // stderr is detected.
          console.log(
            `${Log.prefixes.warn} No build cache found. Please configure build caching for faster rebuilds. Read more: https://nextjs.org/docs/messages/no-cache`
          )
        }
      }

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
      let buildSpinner: ReturnType<typeof createSpinner> = {
        stopAndPersist() {
          return this
        },
      } as any

      const { envInfo, expFeatureInfo } = await getStartServerInfo(dir)
      logStartInfo({
        networkUrl: null,
        appUrl: null,
        envInfo,
        expFeatureInfo,
      })

      if (!isGenerateMode) {
        buildSpinner = createSpinner('Creating an optimized production build')
      }

      NextBuildContext.buildSpinner = buildSpinner

      const validFileMatcher = createValidFileMatcher(
        config.pageExtensions,
        appDir
      )

      const pagesPaths =
        !appDirOnly && pagesDir
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
      const instrumentationHookEnabled = Boolean(
        config.experimental.instrumentationHook
      )

      const includes = [
        middlewareDetectionRegExp,
        ...(instrumentationHookEnabled
          ? [instrumentationHookDetectionRegExp]
          : []),
      ]

      const rootPaths = (await getFilesInDir(rootDir))
        .filter((file) => includes.some((include) => include.test(file)))
        .sort(sortByPageExts(config.pageExtensions))
        .map((file) => path.join(rootDir, file).replace(dir, ''))

      const hasInstrumentationHook = rootPaths.some((p) =>
        p.includes(INSTRUMENTATION_HOOK_FILENAME)
      )
      NextBuildContext.hasInstrumentationHook = hasInstrumentationHook

      const previewProps: __ApiPreviewProps = {
        previewModeId: crypto.randomBytes(16).toString('hex'),
        previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
        previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
      }
      NextBuildContext.previewProps = previewProps

      const mappedPages = nextBuildSpan
        .traceChild('create-pages-mapping')
        .traceFn(() =>
          createPagesMapping({
            isDev: false,
            pageExtensions: config.pageExtensions,
            pagesType: 'pages',
            pagePaths: pagesPaths,
            pagesDir,
          })
        )
      NextBuildContext.mappedPages = mappedPages

      let mappedAppPages: { [page: string]: string } | undefined
      let denormalizedAppPages: string[] | undefined

      if (appDir) {
        const appPaths = await nextBuildSpan
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

        mappedAppPages = nextBuildSpan
          .traceChild('create-app-mapping')
          .traceFn(() =>
            createPagesMapping({
              pagePaths: appPaths,
              isDev: false,
              pagesType: 'app',
              pageExtensions: config.pageExtensions,
              pagesDir: pagesDir,
            })
          )

        // If the metadata route doesn't contain generating dynamic exports,
        // we can replace the dynamic catch-all route and use the static route instead.
        for (const [pageKey, pagePath] of Object.entries(mappedAppPages)) {
          if (pageKey.includes('[[...__metadata_id__]]')) {
            const pageFilePath = getPageFilePath({
              absolutePagePath: pagePath,
              pagesDir,
              appDir,
              rootDir,
            })

            const isDynamic = await isDynamicMetadataRoute(pageFilePath)
            if (!isDynamic) {
              delete mappedAppPages[pageKey]
              mappedAppPages[pageKey.replace('[[...__metadata_id__]]/', '')] =
                pagePath
            }

            if (
              pageKey.includes('sitemap.xml/[[...__metadata_id__]]') &&
              isDynamic
            ) {
              delete mappedAppPages[pageKey]
              mappedAppPages[
                pageKey.replace(
                  'sitemap.xml/[[...__metadata_id__]]',
                  'sitemap/[__metadata_id__]'
                )
              ] = pagePath
            }
          }
        }

        NextBuildContext.mappedAppPages = mappedAppPages
      }

      let mappedRootPaths: { [page: string]: string } = {}
      if (rootPaths.length > 0) {
        mappedRootPaths = createPagesMapping({
          isDev: false,
          pageExtensions: config.pageExtensions,
          pagePaths: rootPaths,
          pagesType: 'root',
          pagesDir: pagesDir,
        })
      }
      NextBuildContext.mappedRootPaths = mappedRootPaths

      const pagesPageKeys = Object.keys(mappedPages)

      const conflictingAppPagePaths: [pagePath: string, appPath: string][] = []
      const appPageKeys: string[] = []
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
          appPageKeys.push(normalizedAppPageKey)
        }
      }

      // Interception routes are modelled as beforeFiles rewrites
      rewrites.beforeFiles.push(
        ...generateInterceptionRoutesRewrites(appPageKeys)
      )

      const totalAppPagesCount = appPageKeys.length

      const pageKeys = {
        pages: pagesPageKeys,
        app: appPageKeys.length > 0 ? appPageKeys : undefined,
      }

      if (turboNextBuild) {
        // TODO(WEB-397) This is a temporary workaround to allow for filtering a
        // subset of pages when building with --experimental-turbo, until we
        // have complete support for all pages.
        if (process.env.NEXT_TURBO_FILTER_PAGES) {
          const filterPages = process.env.NEXT_TURBO_FILTER_PAGES.split(',')
          pageKeys.pages = pageKeys.pages.filter((page) => {
            return filterPages.some((filterPage) => {
              return isMatch(page, filterPage)
            })
          })

          pageKeys.app = pageKeys.app?.filter((page) => {
            return filterPages.some((filterPage) => {
              return isMatch(page, filterPage)
            })
          })
        }
      }

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

      const conflictingPublicFiles: string[] = []
      const hasPages404 = mappedPages['/404']?.startsWith(PAGES_DIR_ALIAS)
      const hasApp404 = !!mappedAppPages?.['/_not-found']
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
              varyHeader: RSC_VARY_HEADER,
              prefetchHeader: NEXT_ROUTER_PREFETCH_HEADER,
              didPostponeHeader: NEXT_DID_POSTPONE_HEADER,
              contentTypeHeader: RSC_CONTENT_TYPE_HEADER,
              suffix: RSC_SUFFIX,
              prefetchSuffix: RSC_PREFETCH_SUFFIX,
            },
            skipMiddlewareUrlNormalize: config.skipMiddlewareUrlNormalize,
          } as RoutesManifest
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

      const combinedRewrites: Rewrite[] = [
        ...rewrites.beforeFiles,
        ...rewrites.afterFiles,
        ...rewrites.fallback,
      ]

      if (config.experimental.clientRouterFilter) {
        const nonInternalRedirects = (config._originalRedirects || []).filter(
          (r: any) => !r.internal
        )
        const clientRouterFilters = createClientRouterFilter(
          appPageKeys,
          config.experimental.clientRouterFilterRedirects
            ? nonInternalRedirects
            : [],
          config.experimental.clientRouterFilterAllowedRate
        )

        NextBuildContext.clientRouterFilters = clientRouterFilters
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

      // Ensure commonjs handling is used for files in the distDir (generally .next)
      // Files outside of the distDir can be "type": "module"
      await fs.writeFile(
        path.join(distDir, 'package.json'),
        '{"type": "commonjs"}'
      )

      // We need to write the manifest with rewrites before build
      await nextBuildSpan
        .traceChild('write-routes-manifest')
        .traceAsyncFn(() =>
          fs.writeFile(
            routesManifestPath,
            formatManifest(routesManifest),
            'utf8'
          )
        )

      // We need to write a partial prerender manifest to make preview mode settings available in edge middleware
      const partialManifest: Partial<PrerenderManifest> = {
        preview: previewProps,
      }

      await fs.writeFile(
        path.join(distDir, PRERENDER_MANIFEST).replace(/\.json$/, '.js'),
        `self.__PRERENDER_MANIFEST=${JSON.stringify(
          JSON.stringify(partialManifest)
        )}`,
        'utf8'
      )

      const outputFileTracingRoot =
        config.experimental.outputFileTracingRoot || dir

      const pagesManifestPath = path.join(
        distDir,
        SERVER_DIRECTORY,
        PAGES_MANIFEST
      )

      const { incrementalCacheHandlerPath } = config.experimental

      const requiredServerFiles = nextBuildSpan
        .traceChild('generate-required-server-files')
        .traceFn(() => ({
          version: 1,
          config: {
            ...config,
            configFile: undefined,
            ...(ciEnvironment.hasNextSupport
              ? {
                  compress: false,
                }
              : {}),
            experimental: {
              ...config.experimental,
              trustHostHeader: ciEnvironment.hasNextSupport,
              incrementalCacheHandlerPath: incrementalCacheHandlerPath
                ? path.relative(distDir, incrementalCacheHandlerPath)
                : undefined,

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
            PRERENDER_MANIFEST.replace(/\.json$/, '.js'),
            path.join(SERVER_DIRECTORY, MIDDLEWARE_MANIFEST),
            path.join(SERVER_DIRECTORY, MIDDLEWARE_BUILD_MANIFEST + '.js'),
            path.join(
              SERVER_DIRECTORY,
              MIDDLEWARE_REACT_LOADABLE_MANIFEST + '.js'
            ),
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
            REACT_LOADABLE_MANIFEST,
            config.optimizeFonts
              ? path.join(SERVER_DIRECTORY, FONT_MANIFEST)
              : null,
            BUILD_ID_FILE,
            path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.js'),
            path.join(SERVER_DIRECTORY, NEXT_FONT_MANIFEST + '.json'),
            ...(hasInstrumentationHook
              ? [
                  path.join(
                    SERVER_DIRECTORY,
                    `${INSTRUMENTATION_HOOK_FILENAME}.js`
                  ),
                  path.join(
                    SERVER_DIRECTORY,
                    `edge-${INSTRUMENTATION_HOOK_FILENAME}.js`
                  ),
                ]
              : []),
          ]
            .filter(nonNullable)
            .map((file) => path.join(config.distDir, file)),
          ignore: [] as string[],
        }))

      async function turbopackBuild() {
        const turboNextBuildStart = process.hrtime()

        const turboJson = findUp.sync('turbo.json', { cwd: dir })
        // eslint-disable-next-line no-shadow
        const packagePath = findUp.sync('package.json', { cwd: dir })
        let binding = await loadBindings(config?.experimental?.useWasmBinary)

        let root =
          turboNextBuildRoot ??
          (turboJson
            ? path.dirname(turboJson)
            : packagePath
            ? path.dirname(packagePath)
            : undefined)

        const hasRewrites =
          rewrites.beforeFiles.length > 0 ||
          rewrites.afterFiles.length > 0 ||
          rewrites.fallback.length > 0

        await binding.turbo.nextBuild({
          ...NextBuildContext,
          root,
          distDir: config.distDir,
          defineEnv: createDefineEnv({
            isTurbopack: turboNextBuild,
            allowedRevalidateHeaderKeys:
              config.experimental.allowedRevalidateHeaderKeys,
            clientRouterFilters: NextBuildContext.clientRouterFilters,
            config,
            dev: false,
            distDir,
            fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
            hasRewrites,
            middlewareMatchers: undefined,
            previewModeId: undefined,
          }),
        })

        const [duration] = process.hrtime(turboNextBuildStart)
        return { duration, buildTraceContext: undefined }
      }
      let buildTraceContext: undefined | BuildTraceContext
      let buildTracesPromise: Promise<any> | undefined = undefined

      // If there's has a custom webpack config and disable the build worker.
      // Otherwise respect the option if it's set.
      const useBuildWorker =
        config.experimental.webpackBuildWorker ||
        (config.experimental.webpackBuildWorker === undefined &&
          !config.webpack)

      nextBuildSpan.setAttribute(
        'has-custom-webpack-config',
        String(!!config.webpack)
      )
      nextBuildSpan.setAttribute('use-build-worker', String(useBuildWorker))

      if (
        config.webpack &&
        config.experimental.webpackBuildWorker === undefined
      ) {
        Log.warn(
          'Custom webpack configuration is detected. When using a custom webpack configuration, the Webpack build worker is disabled by default. To force enable it, set the "experimental.webpackBuildWorker" option to "true". Read more: https://nextjs.org/docs/messages/webpack-build-worker-opt-out'
        )
      }

      if (!isGenerateMode) {
        if (isCompileMode && useBuildWorker) {
          let durationInSeconds = 0

          await webpackBuild(useBuildWorker, ['server']).then((res) => {
            buildTraceContext = res.buildTraceContext
            durationInSeconds += res.duration
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
                pageInfos: serializePageInfos(new Map()),
                staticPages: [],
                hasSsrAmpPages: false,
                buildTraceContext,
                outputFileTracingRoot,
              })
              .catch((err) => {
                console.error(err)
                process.exit(1)
              })
          })

          await webpackBuild(useBuildWorker, ['edge-server']).then((res) => {
            durationInSeconds += res.duration
          })

          await webpackBuild(useBuildWorker, ['client']).then((res) => {
            durationInSeconds += res.duration
          })

          buildSpinner?.stopAndPersist()
          Log.event('Compiled successfully')

          telemetry.record(
            eventBuildCompleted(pagesPaths, {
              durationInSeconds,
              totalAppPagesCount,
            })
          )
        } else {
          const { duration: webpackBuildDuration, ...rest } = turboNextBuild
            ? await turbopackBuild()
            : await webpackBuild(useBuildWorker, null)

          buildTraceContext = rest.buildTraceContext

          telemetry.record(
            eventBuildCompleted(pagesPaths, {
              durationInSeconds: webpackBuildDuration,
              totalAppPagesCount,
            })
          )
        }
      }

      // For app directory, we run type checking after build.
      if (appDir && !(isCompileMode || isGenerateMode)) {
        await startTypeChecking(typeCheckingOptions)
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
      const additionalSsgPaths = new Map<string, Array<string>>()
      const additionalSsgPathsEncoded = new Map<string, Array<string>>()
      const appStaticPaths = new Map<string, Array<string>>()
      const appPrefetchPaths = new Map<string, string>()
      const appStaticPathsEncoded = new Map<string, Array<string>>()
      const appNormalizedPaths = new Map<string, string>()
      const appDynamicParamPaths = new Set<string>()
      const appDefaultConfigs = new Map<string, AppConfig>()
      const pageInfos: PageInfos = new Map<string, PageInfo>()
      const pagesManifest = JSON.parse(
        await fs.readFile(pagesManifestPath, 'utf8')
      ) as PagesManifest
      const buildManifest = JSON.parse(
        await fs.readFile(buildManifestPath, 'utf8')
      ) as BuildManifest
      const appBuildManifest = appDir
        ? (JSON.parse(
            await fs.readFile(appBuildManifestPath, 'utf8')
          ) as AppBuildManifest)
        : undefined

      const timeout = config.staticPageGenerationTimeout || 0
      const staticWorkerPath = require.resolve('./worker')

      let appPathsManifest: Record<string, string> = {}
      const appPathRoutes: Record<string, string> = {}

      if (appDir) {
        appPathsManifest = JSON.parse(
          await fs.readFile(
            path.join(distDir, SERVER_DIRECTORY, APP_PATHS_MANIFEST),
            'utf8'
          )
        )

        Object.keys(appPathsManifest).forEach((entry) => {
          appPathRoutes[entry] = normalizeAppPath(entry)
        })
        await fs.writeFile(
          path.join(distDir, APP_PATH_ROUTES_MANIFEST),
          formatManifest(appPathRoutes),
          'utf-8'
        )
      }

      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

      const numWorkers = config.experimental.memoryBasedWorkersCount
        ? Math.max(
            config.experimental.cpus !== defaultConfig.experimental!.cpus
              ? (config.experimental.cpus as number)
              : Math.min(
                  config.experimental.cpus || 1,
                  Math.floor(os.freemem() / 1e9)
                ),
            // enforce a minimum of 4 workers
            4
          )
        : config.experimental.cpus || 4

      function createStaticWorker(
        incrementalCacheIpcPort?: number,
        incrementalCacheIpcValidationKey?: string
      ) {
        let infoPrinted = false

        return new Worker(staticWorkerPath, {
          timeout: timeout * 1000,
          logger: Log,
          onRestart: (method, [arg], attempts) => {
            if (method === 'exportPage') {
              const pagePath = arg.path
              if (attempts >= 3) {
                throw new Error(
                  `Static page generation for ${pagePath} is still timing out after 3 attempts. See more info here https://nextjs.org/docs/messages/static-page-generation-timeout`
                )
              }
              Log.warn(
                `Restarted static page generation for ${pagePath} because it took more than ${timeout} seconds`
              )
            } else {
              const pagePath = arg.path
              if (attempts >= 2) {
                throw new Error(
                  `Collecting page data for ${pagePath} is still timing out after 2 attempts. See more info here https://nextjs.org/docs/messages/page-data-collection-timeout`
                )
              }
              Log.warn(
                `Restarted collecting page data for ${pagePath} because it took more than ${timeout} seconds`
              )
            }
            if (!infoPrinted) {
              Log.warn(
                'See more info here https://nextjs.org/docs/messages/static-page-generation-timeout'
              )
              infoPrinted = true
            }
          },
          numWorkers,
          forkOptions: {
            env: {
              ...process.env,
              __NEXT_INCREMENTAL_CACHE_IPC_PORT: incrementalCacheIpcPort
                ? incrementalCacheIpcPort + ''
                : undefined,
              __NEXT_INCREMENTAL_CACHE_IPC_KEY:
                incrementalCacheIpcValidationKey,
            },
          },
          enableWorkerThreads: config.experimental.workerThreads,
          exposedMethods: [
            'hasCustomGetInitialProps',
            'isPageStatic',
            'getDefinedNamedExports',
            'exportPage',
          ],
        }) as Worker &
          Pick<
            typeof import('./worker'),
            | 'hasCustomGetInitialProps'
            | 'isPageStatic'
            | 'getDefinedNamedExports'
            | 'exportPage'
          >
      }

      let incrementalCacheIpcPort
      let incrementalCacheIpcValidationKey

      if (config.experimental.staticWorkerRequestDeduping) {
        let CacheHandler
        if (incrementalCacheHandlerPath) {
          CacheHandler = require(path.isAbsolute(incrementalCacheHandlerPath)
            ? incrementalCacheHandlerPath
            : path.join(dir, incrementalCacheHandlerPath))
          CacheHandler = CacheHandler.default || CacheHandler
        }

        const cacheInitialization = await initializeIncrementalCache({
          fs: nodeFs,
          dev: false,
          pagesDir: true,
          appDir: true,
          fetchCache: true,
          flushToDisk: ciEnvironment.hasNextSupport
            ? false
            : config.experimental.isrFlushToDisk,
          serverDistDir: path.join(distDir, 'server'),
          fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
          maxMemoryCacheSize: config.experimental.isrMemoryCacheSize,
          getPrerenderManifest: () => ({
            version: -1 as any, // letting us know this doesn't conform to spec
            routes: {},
            dynamicRoutes: {},
            notFoundRoutes: [],
            preview: null as any, // `preview` is special case read in next-dev-server
          }),
          requestHeaders: {},
          CurCacheHandler: CacheHandler,
          minimalMode: ciEnvironment.hasNextSupport,
          allowedRevalidateHeaderKeys:
            config.experimental.allowedRevalidateHeaderKeys,
          experimental: { ppr: config.experimental.ppr === true },
        })

        incrementalCacheIpcPort = cacheInitialization.ipcPort
        incrementalCacheIpcValidationKey = cacheInitialization.ipcValidationKey
      }

      const pagesStaticWorkers = createStaticWorker(
        incrementalCacheIpcPort,
        incrementalCacheIpcValidationKey
      )
      const appStaticWorkers = appDir
        ? createStaticWorker(
            incrementalCacheIpcPort,
            incrementalCacheIpcValidationKey
          )
        : undefined

      const analysisBegin = process.hrtime()
      const staticCheckSpan = nextBuildSpan.traceChild('static-check')

      const functionsConfigManifest = {} as Record<string, Record<string, any>>
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

        const nonStaticErrorPageSpan = staticCheckSpan.traceChild(
          'check-static-error-page'
        )
        const errorPageHasCustomGetInitialProps =
          nonStaticErrorPageSpan.traceAsyncFn(
            async () =>
              hasCustomErrorPage &&
              (await pagesStaticWorkers.hasCustomGetInitialProps(
                '/_error',
                distDir,
                runtimeEnvConfig,
                false
              ))
          )

        const errorPageStaticResult = nonStaticErrorPageSpan.traceAsyncFn(
          async () =>
            hasCustomErrorPage &&
            pagesStaticWorkers.isPageStatic({
              dir,
              page: '/_error',
              distDir,
              configFileName,
              runtimeEnvConfig,
              httpAgentOptions: config.httpAgentOptions,
              locales: config.i18n?.locales,
              defaultLocale: config.i18n?.defaultLocale,
              nextConfigOutput: config.output,
              ppr: config.experimental.ppr === true,
            })
        )

        const appPageToCheck = '/_app'

        const customAppGetInitialPropsPromise =
          pagesStaticWorkers.hasCustomGetInitialProps(
            appPageToCheck,
            distDir,
            runtimeEnvConfig,
            true
          )

        const namedExportsPromise = pagesStaticWorkers.getDefinedNamedExports(
          appPageToCheck,
          distDir,
          runtimeEnvConfig
        )

        // eslint-disable-next-line @typescript-eslint/no-shadow
        let isNextImageImported: boolean | undefined
        // eslint-disable-next-line @typescript-eslint/no-shadow
        let hasSsrAmpPages = false

        const computedManifestData = await computeFromManifest(
          { build: buildManifest, app: appBuildManifest },
          distDir,
          config.experimental.gzipSize
        )

        const middlewareManifest: MiddlewareManifest = require(path.join(
          distDir,
          SERVER_DIRECTORY,
          MIDDLEWARE_MANIFEST
        ))

        const actionManifest = appDir
          ? (require(path.join(
              distDir,
              SERVER_DIRECTORY,
              SERVER_REFERENCE_MANIFEST + '.json'
            )) as ActionManifest)
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

                let isPPR = false
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

                const staticInfo = pagePath
                  ? await getPageStaticInfo({
                      pageFilePath,
                      nextConfig: config,
                      pageType,
                    })
                  : undefined

                if (staticInfo?.extraConfig) {
                  functionsConfigManifest[page] = staticInfo.extraConfig
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
                          return (
                            pageType === 'app'
                              ? appStaticWorkers
                              : pagesStaticWorkers
                          )!.isPageStatic({
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
                            incrementalCacheHandlerPath:
                              config.experimental.incrementalCacheHandlerPath,
                            isrFlushToDisk: ciEnvironment.hasNextSupport
                              ? false
                              : config.experimental.isrFlushToDisk,
                            maxMemoryCacheSize:
                              config.experimental.isrMemoryCacheSize,
                            nextConfigOutput: config.output,
                            ppr: config.experimental.ppr === true,
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
                          // If this route can be partially pre-rendered, then
                          // mark it as such and mark it that it can be
                          // generated server-side.
                          if (workerResult.isPPR) {
                            isPPR = workerResult.isPPR
                            isSSG = true
                            isStatic = true

                            appStaticPaths.set(originalAppPath, [])
                            appStaticPathsEncoded.set(originalAppPath, [])
                          }

                          if (
                            workerResult.encodedPrerenderRoutes &&
                            workerResult.prerenderRoutes
                          ) {
                            appStaticPaths.set(
                              originalAppPath,
                              workerResult.prerenderRoutes
                            )
                            appStaticPathsEncoded.set(
                              originalAppPath,
                              workerResult.encodedPrerenderRoutes
                            )
                            ssgPageRoutes = workerResult.prerenderRoutes
                            isSSG = true
                          }

                          const appConfig = workerResult.appConfig || {}
                          if (appConfig.revalidate !== 0) {
                            const isDynamic = isDynamicRoute(page)
                            const hasGenerateStaticParams =
                              !!workerResult.prerenderRoutes?.length

                            if (
                              config.output === 'export' &&
                              isDynamic &&
                              !hasGenerateStaticParams
                            ) {
                              throw new Error(
                                `Page "${page}" is missing "generateStaticParams()" so it cannot be used with "output: export" config.`
                              )
                            }

                            if (
                              // Mark the app as static if:
                              // - It has no dynamic param
                              // - It doesn't have generateStaticParams but `dynamic` is set to
                              //   `error` or `force-static`
                              !isDynamic
                            ) {
                              appStaticPaths.set(originalAppPath, [page])
                              appStaticPathsEncoded.set(originalAppPath, [page])
                              isStatic = true
                            } else if (
                              isDynamic &&
                              !hasGenerateStaticParams &&
                              (appConfig.dynamic === 'error' ||
                                appConfig.dynamic === 'force-static')
                            ) {
                              appStaticPaths.set(originalAppPath, [])
                              appStaticPathsEncoded.set(originalAppPath, [])
                              isStatic = true
                              isPPR = false
                            }
                          }

                          if (workerResult.prerenderFallback) {
                            // whether or not to allow requests for paths not
                            // returned from generateStaticParams
                            appDynamicParamPaths.add(originalAppPath)
                          }
                          appDefaultConfigs.set(originalAppPath, appConfig)

                          // Only generate the app prefetch rsc if the route is
                          // an app page.
                          if (
                            !isStatic &&
                            !isAppRouteRoute(originalAppPath) &&
                            !isDynamicRoute(originalAppPath) &&
                            !isPPR
                          ) {
                            appPrefetchPaths.set(originalAppPath, page)
                          }
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
                            workerResult.prerenderRoutes &&
                            workerResult.encodedPrerenderRoutes
                          ) {
                            additionalSsgPaths.set(
                              page,
                              workerResult.prerenderRoutes
                            )
                            additionalSsgPathsEncoded.set(
                              page,
                              workerResult.encodedPrerenderRoutes
                            )
                            ssgPageRoutes = workerResult.prerenderRoutes
                          }

                          if (workerResult.prerenderFallback === 'blocking') {
                            ssgBlockingFallbackPages.add(page)
                          } else if (workerResult.prerenderFallback === true) {
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
                  isPPR,
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

      if (!hasSsrAmpPages) {
        requiredServerFiles.ignore.push(
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

      if (Object.keys(functionsConfigManifest).length > 0) {
        const manifest: {
          version: number
          functions: Record<string, Record<string, string | number>>
        } = {
          version: 1,
          functions: functionsConfigManifest,
        }

        await fs.writeFile(
          path.join(distDir, SERVER_DIRECTORY, FUNCTIONS_CONFIG_MANIFEST),
          formatManifest(manifest),
          'utf8'
        )
      }

      if (!isGenerateMode && config.outputFileTracing && !buildTracesPromise) {
        buildTracesPromise = collectBuildTraces({
          dir,
          config,
          distDir,
          pageInfos,
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

        await fs.writeFile(
          routesManifestPath,
          formatManifest(routesManifest),
          'utf8'
        )
      }

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

        requiredServerFiles.files.push(
          ...cssFilePaths.map((filePath) =>
            path.join(config.distDir, 'static', filePath)
          )
        )
      }

      const features: EventBuildFeatureUsage[] = [
        {
          featureName: 'experimental/optimizeCss',
          invocationCount: config.experimental.optimizeCss ? 1 : 0,
        },
        {
          featureName: 'experimental/nextScriptWorkers',
          invocationCount: config.experimental.nextScriptWorkers ? 1 : 0,
        },
        {
          featureName: 'optimizeFonts',
          invocationCount: config.optimizeFonts ? 1 : 0,
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

      await fs.writeFile(
        path.join(distDir, SERVER_FILES_MANIFEST),
        formatManifest(requiredServerFiles),
        'utf8'
      )

      const middlewareManifest: MiddlewareManifest = JSON.parse(
        await fs.readFile(
          path.join(distDir, SERVER_DIRECTORY, MIDDLEWARE_MANIFEST),
          'utf8'
        )
      )

      const finalPrerenderRoutes: { [route: string]: SsgRoute } = {}
      const finalDynamicRoutes: PrerenderManifest['dynamicRoutes'] = {}
      const tbdPrerenderRoutes: string[] = []
      let ssgNotFoundPaths: string[] = []

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
      const isApp404Static = appStaticPaths.has('/_not-found')
      const hasStaticApp404 = hasApp404 && isApp404Static

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
            additionalSsgPaths
          )
          const exportApp: ExportAppWorker = require('../export').default

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
                        query: { __nextFallback: 'true' },
                      }
                    } else {
                      defaultMap[page] = {
                        page,
                        query: { __nextFallback: 'true' },
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
              additionalSsgPaths.forEach((routes, page) => {
                const encodedRoutes = additionalSsgPathsEncoded.get(page)

                routes.forEach((route, routeIdx) => {
                  defaultMap[route] = {
                    page,
                    query: { __nextSsgPath: encodedRoutes?.[routeIdx] },
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
              appStaticPaths.forEach((routes, originalAppPath) => {
                const encodedRoutes = appStaticPathsEncoded.get(originalAppPath)
                const appConfig = appDefaultConfigs.get(originalAppPath) || {}

                routes.forEach((route, routeIdx) => {
                  defaultMap[route] = {
                    page: originalAppPath,
                    query: { __nextSsgPath: encodedRoutes?.[routeIdx] },
                    _isDynamicError: appConfig.dynamic === 'error',
                    _isAppDir: true,
                  }
                })
              })

              // Ensure we don't generate explicit app prefetches while in PPR.
              if (config.experimental.ppr && appPrefetchPaths.size > 0) {
                throw new Error(
                  "Invariant: explicit app prefetches shouldn't generated with PPR"
                )
              }

              for (const [originalAppPath, page] of appPrefetchPaths) {
                defaultMap[page] = {
                  page: originalAppPath,
                  query: {},
                  _isAppDir: true,
                  _isAppPrefetch: true,
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
                      query: {
                        __nextLocale: locale,
                        __nextFallback: isFallback ? 'true' : undefined,
                      },
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

          const exportOptions: ExportAppOptions = {
            nextConfig: exportConfig,
            enabledDirectories,
            silent: false,
            buildExport: true,
            debugOutput,
            threads: config.experimental.cpus,
            pages: combinedPages,
            outdir: path.join(distDir, 'export'),
            statusMessage: 'Generating static pages',
            // The worker already explicitly binds `this` to each of the
            // exposed methods.
            exportAppPageWorker: appStaticWorkers?.exportPage,
            exportPageWorker: pagesStaticWorkers?.exportPage,
            endWorker: async () => {
              await pagesStaticWorkers.end()
              await appStaticWorkers?.end()
            },
          }

          const exportResult = await exportApp(
            dir,
            exportOptions,
            nextBuildSpan
          )

          // If there was no result, there's nothing more to do.
          if (!exportResult) return

          ssgNotFoundPaths = Array.from(exportResult.ssgNotFoundPaths)

          // remove server bundles that were exported
          for (const page of staticPages) {
            const serverBundle = getPagePath(page, distDir, undefined, false)
            await fs.unlink(serverBundle)
          }

          for (const [originalAppPath, routes] of appStaticPaths) {
            const page = appNormalizedPaths.get(originalAppPath) || ''
            const appConfig = appDefaultConfigs.get(originalAppPath) || {}
            let hasDynamicData =
              appConfig.revalidate === 0 ||
              exportResult.byPath.get(page)?.revalidate === 0

            if (hasDynamicData && pageInfos.get(page)?.isStatic) {
              // if the page was marked as being static, but it contains dynamic data
              // (ie, in the case of a static generation bailout), then it should be marked dynamic
              pageInfos.set(page, {
                ...(pageInfos.get(page) as PageInfo),
                isStatic: false,
                isSSG: false,
              })
            }

            const isRouteHandler = isAppRouteRoute(originalAppPath)

            // When this is an app page and PPR is enabled, the route supports
            // partial pre-rendering.
            const experimentalPPR =
              !isRouteHandler && config.experimental.ppr === true
                ? true
                : undefined

            // this flag is used to selectively bypass the static cache and invoke the lambda directly
            // to enable server actions on static routes
            const bypassFor: RouteHas[] = [
              { type: 'header', key: ACTION },
              {
                type: 'header',
                key: 'content-type',
                value: 'multipart/form-data',
              },
            ]

            routes.forEach((route) => {
              if (isDynamicRoute(page) && route === page) return
              if (route === '/_not-found') return

              const {
                revalidate = appConfig.revalidate ?? false,
                metadata = {},
                hasEmptyPrelude,
                hasPostponed,
              } = exportResult.byPath.get(route) ?? {}

              pageInfos.set(route, {
                ...(pageInfos.get(route) as PageInfo),
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
                const normalizedRoute = normalizePagePath(route)

                let dataRoute: string | null
                if (isRouteHandler) {
                  dataRoute = null
                } else {
                  dataRoute = path.posix.join(`${normalizedRoute}${RSC_SUFFIX}`)
                }

                let prefetchDataRoute: string | null | undefined
                if (experimentalPPR) {
                  prefetchDataRoute = path.posix.join(
                    `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                  )
                }

                const routeMeta: Partial<SsgRoute> = {}

                if (metadata.status !== 200) {
                  routeMeta.initialStatus = metadata.status
                }

                const exportHeaders = metadata.headers
                const headerKeys = Object.keys(exportHeaders || {})

                if (exportHeaders && headerKeys.length) {
                  routeMeta.initialHeaders = {}

                  // normalize header values as initialHeaders
                  // must be Record<string, string>
                  for (const key of headerKeys) {
                    let value = exportHeaders[key]

                    if (Array.isArray(value)) {
                      if (key === 'set-cookie') {
                        value = value.join(',')
                      } else {
                        value = value[value.length - 1]
                      }
                    }

                    if (typeof value === 'string') {
                      routeMeta.initialHeaders[key] = value
                    }
                  }
                }

                finalPrerenderRoutes[route] = {
                  ...routeMeta,
                  experimentalPPR,
                  experimentalBypassFor: bypassFor,
                  initialRevalidateSeconds: revalidate,
                  srcRoute: page,
                  dataRoute,
                  prefetchDataRoute,
                }
              } else {
                hasDynamicData = true
                // we might have determined during prerendering that this page
                // used dynamic data
                pageInfos.set(route, {
                  ...(pageInfos.get(route) as PageInfo),
                  isSSG: false,
                  isStatic: false,
                })
              }
            })

            if (!hasDynamicData && isDynamicRoute(originalAppPath)) {
              const normalizedRoute = normalizePagePath(page)
              const dataRoute = path.posix.join(
                `${normalizedRoute}${RSC_SUFFIX}`
              )

              let prefetchDataRoute: string | null | undefined
              if (experimentalPPR) {
                prefetchDataRoute = path.posix.join(
                  `${normalizedRoute}${RSC_PREFETCH_SUFFIX}`
                )
              }

              pageInfos.set(page, {
                ...(pageInfos.get(page) as PageInfo),
                isDynamicAppRoute: true,
                // if PPR is turned on and the route contains a dynamic segment,
                // we assume it'll be partially prerendered
                hasPostponed: experimentalPPR,
              })

              // TODO: create a separate manifest to allow enforcing
              // dynamicParams for non-static paths?
              finalDynamicRoutes[page] = {
                experimentalPPR,
                experimentalBypassFor: bypassFor,
                routeRegex: normalizeRouteRegex(
                  getNamedRouteRegex(page, false).re.source
                ),
                dataRoute,
                // if dynamicParams are enabled treat as fallback:
                // 'blocking' if not it's fallback: false
                fallback: appDynamicParamPaths.has(originalAppPath)
                  ? null
                  : false,
                dataRouteRegex: isRouteHandler
                  ? null
                  : normalizeRouteRegex(
                      getNamedRouteRegex(
                        dataRoute.replace(/\.rsc$/, ''),
                        false
                      ).re.source.replace(/\(\?:\\\/\)\?\$$/, '\\.rsc$')
                    ),
                prefetchDataRoute,
                prefetchDataRouteRegex:
                  isRouteHandler || !prefetchDataRoute
                    ? undefined
                    : normalizeRouteRegex(
                        getNamedRouteRegex(
                          prefetchDataRoute.replace(/\.prefetch\.rsc$/, ''),
                          false
                        ).re.source.replace(
                          /\(\?:\\\/\)\?\$$/,
                          '\\.prefetch\\.rsc$'
                        )
                      ),
              }
            }
          }

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
                const orig = path.join(exportOptions.outdir, file)
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
                const isNotFound = ssgNotFoundPaths.includes(page)

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

                  for (const locale of i18n.locales) {
                    const curPath = `/${locale}${page === '/' ? '' : page}`
                    const localeExt = page === '/' ? path.extname(file) : ''
                    const relativeDestNoPages = relativeDest.slice(
                      'pages/'.length
                    )

                    if (isSsg && ssgNotFoundPaths.includes(curPath)) {
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
                      exportOptions.outdir,
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

                    finalPrerenderRoutes[localePage] = {
                      initialRevalidateSeconds:
                        exportResult.byPath.get(localePage)?.revalidate ??
                        false,
                      experimentalPPR: undefined,
                      srcRoute: null,
                      dataRoute: path.posix.join(
                        '/_next/data',
                        buildId,
                        `${file}.json`
                      ),
                      prefetchDataRoute: undefined,
                    }
                  }
                } else {
                  finalPrerenderRoutes[page] = {
                    initialRevalidateSeconds:
                      exportResult.byPath.get(page)?.revalidate ?? false,
                    experimentalPPR: undefined,
                    srcRoute: null,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${file}.json`
                    ),
                    // Pages does not have a prefetch data route.
                    prefetchDataRoute: undefined,
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
                const extraRoutes = additionalSsgPaths.get(page) || []
                for (const route of extraRoutes) {
                  const pageFile = normalizePagePath(route)
                  await moveExportedPage(
                    page,
                    route,
                    pageFile,
                    isSsg,
                    'html',
                    true
                  )
                  await moveExportedPage(
                    page,
                    route,
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
                    exportResult.byPath.get(route)?.revalidate ?? false

                  if (typeof initialRevalidateSeconds === 'undefined') {
                    throw new Error("Invariant: page wasn't built")
                  }

                  finalPrerenderRoutes[route] = {
                    initialRevalidateSeconds,
                    experimentalPPR: undefined,
                    srcRoute: page,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${normalizePagePath(route)}.json`
                    ),
                    // Pages does not have a prefetch data route.
                    prefetchDataRoute: undefined,
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
          await fs.rm(exportOptions.outdir, { recursive: true, force: true })
          await fs.writeFile(
            pagesManifestPath,
            formatManifest(pagesManifest),
            'utf8'
          )
        })
      }

      const postBuildSpinner = createSpinner('Finalizing page optimization')
      let buildTracesSpinner = createSpinner(`Collecting build traces`)

      // ensure the worker is not left hanging
      pagesStaticWorkers.close()
      appStaticWorkers?.close()

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
          middlewareCount: Object.keys(rootPaths).length > 0 ? 1 : 0,
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
      }

      if (ssgPages.size > 0 || appDir) {
        tbdPrerenderRoutes.forEach((tbdRoute) => {
          const normalizedRoute = normalizePagePath(tbdRoute)
          const dataRoute = path.posix.join(
            '/_next/data',
            buildId,
            `${normalizedRoute}.json`
          )

          finalDynamicRoutes[tbdRoute] = {
            routeRegex: normalizeRouteRegex(
              getNamedRouteRegex(tbdRoute, false).re.source
            ),
            experimentalPPR: undefined,
            dataRoute,
            fallback: ssgBlockingFallbackPages.has(tbdRoute)
              ? null
              : ssgStaticFallbackPages.has(tbdRoute)
              ? `${normalizedRoute}.html`
              : false,
            dataRouteRegex: normalizeRouteRegex(
              getNamedRouteRegex(
                dataRoute.replace(/\.json$/, ''),
                false
              ).re.source.replace(/\(\?:\\\/\)\?\$$/, '\\.json$')
            ),
            // Pages does not have a prefetch data route.
            prefetchDataRoute: undefined,
            prefetchDataRouteRegex: undefined,
          }
        })
        const prerenderManifest: Readonly<PrerenderManifest> = {
          version: 4,
          routes: finalPrerenderRoutes,
          dynamicRoutes: finalDynamicRoutes,
          notFoundRoutes: ssgNotFoundPaths,
          preview: previewProps,
        }
        NextBuildContext.previewModeId = previewProps.previewModeId
        NextBuildContext.fetchCacheKeyPrefix =
          config.experimental.fetchCacheKeyPrefix
        NextBuildContext.allowedRevalidateHeaderKeys =
          config.experimental.allowedRevalidateHeaderKeys

        await fs.writeFile(
          path.join(distDir, PRERENDER_MANIFEST),
          formatManifest(prerenderManifest),
          'utf8'
        )
        await fs.writeFile(
          path.join(distDir, PRERENDER_MANIFEST).replace(/\.json$/, '.js'),
          `self.__PRERENDER_MANIFEST=${JSON.stringify(
            JSON.stringify(prerenderManifest)
          )}`,
          'utf8'
        )
        await generateClientSsgManifest(prerenderManifest, {
          distDir,
          buildId,
          locales: config.i18n?.locales || [],
        })
      } else {
        const prerenderManifest: Readonly<PrerenderManifest> = {
          version: 4,
          routes: {},
          dynamicRoutes: {},
          preview: previewProps,
          notFoundRoutes: [],
        }
        await fs.writeFile(
          path.join(distDir, PRERENDER_MANIFEST),
          formatManifest(prerenderManifest),
          'utf8'
        )
        await fs.writeFile(
          path.join(distDir, PRERENDER_MANIFEST).replace(/\.json$/, '.js'),
          `self.__PRERENDER_MANIFEST=${JSON.stringify(
            JSON.stringify(prerenderManifest)
          )}`,
          'utf8'
        )
      }

      const images = { ...config.images }
      const { deviceSizes, imageSizes } = images
      ;(images as any).sizes = [...deviceSizes, ...imageSizes]
      images.remotePatterns = (config?.images?.remotePatterns || []).map(
        (p: RemotePattern) => ({
          // Should be the same as matchRemotePattern()
          protocol: p.protocol,
          hostname: makeRe(p.hostname).source,
          port: p.port,
          pathname: makeRe(p.pathname ?? '**').source,
        })
      )

      await fs.writeFile(
        path.join(distDir, IMAGES_MANIFEST),
        formatManifest({
          version: 1,
          images,
        }),
        'utf8'
      )
      await fs.writeFile(
        path.join(distDir, EXPORT_MARKER),
        formatManifest({
          version: 1,
          hasExportPathMap: typeof config.exportPathMap === 'function',
          exportTrailingSlash: config.trailingSlash === true,
          isNextImageImported: isNextImageImported === true,
        }),
        'utf8'
      )
      await fs.unlink(path.join(distDir, EXPORT_DETAIL)).catch((err) => {
        if (err.code === 'ENOENT') {
          return Promise.resolve()
        }
        return Promise.reject(err)
      })

      if (debugOutput) {
        nextBuildSpan
          .traceChild('print-custom-routes')
          .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
      }

      if (config.analyticsId) {
        console.log(
          bold(green('Next.js Speed Insights')) +
            ' is enabled for this production build. ' +
            "You'll receive a Real Experience Score computed by all of your visitors."
        )
        console.log('')
      }

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

      if (config.output === 'export') {
        if (buildTracesSpinner) {
          buildTracesSpinner?.stop()
          buildTracesSpinner = undefined
        }

        const exportApp: typeof import('../export').default =
          require('../export').default

        const pagesWorker = createStaticWorker(
          incrementalCacheIpcPort,
          incrementalCacheIpcValidationKey
        )
        const appWorker = createStaticWorker(
          incrementalCacheIpcPort,
          incrementalCacheIpcValidationKey
        )

        const options: ExportAppOptions = {
          buildExport: false,
          nextConfig: config,
          enabledDirectories,
          silent: true,
          threads: config.experimental.cpus,
          outdir: path.join(dir, configOutDir),
          // The worker already explicitly binds `this` to each of the
          // exposed methods.
          exportAppPageWorker: appWorker?.exportPage,
          exportPageWorker: pagesWorker?.exportPage,
          endWorker: async () => {
            await pagesWorker.end()
            await appWorker.end()
          },
        }

        await exportApp(dir, options, nextBuildSpan)

        // ensure the worker is not left hanging
        pagesWorker.close()
        appWorker.close()
      }
      await buildTracesPromise

      if (config.output === 'standalone') {
        await nextBuildSpan
          .traceChild('copy-traced-files')
          .traceAsyncFn(async () => {
            await copyTracedFiles(
              dir,
              distDir,
              pageKeys.pages,
              denormalizedAppPages,
              outputFileTracingRoot,
              requiredServerFiles.config,
              middlewareManifest,
              hasInstrumentationHook,
              staticPages
            )

            if (config.output === 'standalone') {
              for (const file of [
                ...requiredServerFiles.files,
                path.join(config.distDir, SERVER_FILES_MANIFEST),
                ...loadedEnvFiles.reduce<string[]>((acc, envFile) => {
                  if (['.env', '.env.production'].includes(envFile.path)) {
                    acc.push(envFile.path)
                  }
                  return acc
                }, []),
              ]) {
                const filePath = path.join(dir, file)
                const outputPath = path.join(
                  distDir,
                  'standalone',
                  path.relative(outputFileTracingRoot, filePath)
                )
                await fs.mkdir(path.dirname(outputPath), {
                  recursive: true,
                })
                await fs.copyFile(filePath, outputPath)
              }
              await recursiveCopy(
                path.join(distDir, SERVER_DIRECTORY, 'pages'),
                path.join(
                  distDir,
                  'standalone',
                  path.relative(outputFileTracingRoot, distDir),
                  SERVER_DIRECTORY,
                  'pages'
                ),
                { overwrite: true }
              )
              if (appDir) {
                const originalServerApp = path.join(
                  distDir,
                  SERVER_DIRECTORY,
                  'app'
                )
                if (existsSync(originalServerApp)) {
                  await recursiveCopy(
                    originalServerApp,
                    path.join(
                      distDir,
                      'standalone',
                      path.relative(outputFileTracingRoot, distDir),
                      SERVER_DIRECTORY,
                      'app'
                    ),
                    { overwrite: true }
                  )
                }
              }
            }
          })
      }

      if (buildTracesSpinner) {
        buildTracesSpinner.stopAndPersist()
        buildTracesSpinner = undefined
      }

      if (postBuildSpinner) postBuildSpinner.stopAndPersist()
      console.log()

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
    })

    return buildResult
  } finally {
    // Ensure we wait for lockfile patching if present
    await lockfilePatchPromise.cur

    // Ensure all traces are flushed before finishing the command
    await flushAllTraces()
    teardownTraceSubscriber()
    teardownHeapProfiler()
    teardownCrashReporter()
  }
}
