import type { RemotePattern } from '../shared/lib/image-config'
import type { AppBuildManifest } from './webpack/plugins/app-build-manifest-plugin'
import type { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import type { ExportPathMap, NextConfigComplete } from '../server/config-shared'
import type { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import type { ActionManifest } from './webpack/plugins/flight-client-entry-plugin'
import type { ExportOptions } from '../export'

import '../lib/setup-exception-listeners'
import { loadEnvConfig } from '@next/env'
import chalk from 'next/dist/compiled/chalk'
import crypto from 'crypto'
import { isMatch, makeRe } from 'next/dist/compiled/micromatch'
import { promises } from 'fs'
import os from 'os'
import { Worker } from '../lib/worker'
import { defaultConfig } from '../server/config-shared'
import devalue from 'next/dist/compiled/devalue'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'
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
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { findPagesDir } from '../lib/find-pages-dir'
import loadCustomRoutes, {
  CustomRoutes,
  normalizeRouteRegex,
  Redirect,
  Rewrite,
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
  CLIENT_REFERENCE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVER_DIRECTORY,
  SERVER_FILES_MANIFEST,
  STATIC_STATUS_PAGES,
  MIDDLEWARE_MANIFEST,
  APP_PATHS_MANIFEST,
  APP_PATH_ROUTES_MANIFEST,
  APP_BUILD_MANIFEST,
  FLIGHT_SERVER_CSS_MANIFEST,
  RSC_MODULE_TYPES,
  NEXT_FONT_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  TURBO_TRACE_DEFAULT_MEMORY_LIMIT,
  TRACE_OUTPUT_VERSION,
  SERVER_REFERENCE_MANIFEST,
} from '../shared/lib/constants'
import { getSortedRoutes, isDynamicRoute } from '../shared/lib/router/utils'
import { __ApiPreviewProps } from '../server/api-utils'
import loadConfig from '../server/config'
import { BuildManifest } from '../server/get-page-files'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getPagePath } from '../server/require'
import * as ciEnvironment from '../telemetry/ci-info'
import {
  eventBuildOptimize,
  eventCliSession,
  eventBuildFeatureUsage,
  eventNextPlugins,
  EVENT_BUILD_FEATURE_USAGE,
  EventBuildFeatureUsage,
  eventPackageUsedInGetServerSideProps,
  eventBuildCompleted,
} from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import {
  isDynamicMetadataRoute,
  getPageStaticInfo,
} from './analysis/get-page-static-info'
import { createPagesMapping, getPageFilePath } from './entries'
import { generateBuildId } from './generate-build-id'
import { isWriteable } from './is-writeable'
import * as Log from './output/log'
import createSpinner from './spinner'
import { trace, flushAllTraces, setGlobal } from '../trace'
import {
  detectConflictingPaths,
  computeFromManifest,
  getJsPageSizeInKb,
  PageInfo,
  printCustomRoutes,
  printTreeView,
  copyTracedFiles,
  isReservedPage,
  AppConfig,
} from './utils'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import isError, { NextError } from '../lib/is-error'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveReadDir } from '../lib/recursive-readdir'
import {
  lockfilePatchPromise,
  teardownTraceSubscriber,
  teardownCrashReporter,
  loadBindings,
  teardownHeapProfiler,
} from './swc'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import { flatReaddir } from '../lib/flat-readdir'
import { eventSwcPlugins } from '../telemetry/events/swc-plugins'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import {
  RSC,
  RSC_CONTENT_TYPE_HEADER,
  RSC_VARY_HEADER,
} from '../client/components/app-router-headers'
import { webpackBuild } from './webpack-build'
import { NextBuildContext } from './build-context'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
import { isAppRouteRoute } from '../lib/is-app-route-route'
import { createClientRouterFilter } from '../lib/create-client-router-filter'
import { createValidFileMatcher } from '../server/lib/find-page-file'
import { startTypeChecking } from './type-check'
import { generateInterceptionRoutesRewrites } from '../lib/generate-interception-routes-rewrites'

export type SsgRoute = {
  initialRevalidateSeconds: number | false
  srcRoute: string | null
  dataRoute: string | null
  initialStatus?: number
  initialHeaders?: Record<string, string>
}

export type DynamicSsgRoute = {
  routeRegex: string
  fallback: string | null | false
  dataRoute: string | null
  dataRouteRegex: string | null
}

export type PrerenderManifest = {
  version: 4
  routes: { [route: string]: SsgRoute }
  dynamicRoutes: { [route: string]: DynamicSsgRoute }
  notFoundRoutes: string[]
  preview: __ApiPreviewProps
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

  await promises.writeFile(
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
  buildMode: 'default' | 'experimental-compile' | 'experimental-generate'
): Promise<void> {
  const isCompile = buildMode === 'experimental-compile'
  const isGenerate = buildMode === 'experimental-generate'

  let hasAppDir = false
  try {
    const nextBuildSpan = trace('next-build', undefined, {
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
        .traceAsyncFn(() => loadConfig(PHASE_PRODUCTION_BUILD, dir))
      NextBuildContext.config = config

      let configOutDir = 'out'
      if (config.output === 'export' && config.distDir !== '.next') {
        // In the past, a user had to run "next build" to generate
        // ".next" (or whatever the distDir) followed by "next export"
        // to generate "out" (or whatever the outDir). However, when
        // "output: export" is configured, "next build" does both steps.
        // So the user-configured dirDir is actually the outDir.
        configOutDir = config.distDir
        config.distDir = '.next'
      }
      const distDir = path.join(dir, config.distDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      setGlobal('distDir', distDir)

      let buildId: string = ''

      if (isGenerate) {
        buildId = await promises.readFile(
          path.join(distDir, 'BUILD_ID'),
          'utf8'
        )
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
        const hasCache = await fileExists(cacheDir)

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
      const isAppDirEnabled = !!config.experimental.appDir
      const { pagesDir, appDir } = findPagesDir(dir, isAppDirEnabled)
      NextBuildContext.pagesDir = pagesDir
      NextBuildContext.appDir = appDir
      hasAppDir = Boolean(appDir)

      if (isAppDirEnabled && hasAppDir) {
        if (
          (!process.env.__NEXT_TEST_MODE ||
            process.env.__NEXT_TEST_MODE === 'e2e') &&
          ciEnvironment.hasNextSupport
        ) {
          const requireHook = require.resolve('../server/require-hook')
          const contents = await promises.readFile(requireHook, 'utf8')
          await promises.writeFile(
            requireHook,
            `process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = '${
              config.experimental.serverActions ? 'experimental' : 'next'
            }'\n${contents}`
          )
        }
      }

      const isSrcDir = path
        .relative(dir, pagesDir || appDir || '')
        .startsWith('src')
      const hasPublicDir = await fileExists(publicDir)

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
      if (!appDir && !isCompile) await startTypeChecking(typeCheckingOptions)

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

      if (!isGenerate) {
        buildSpinner = createSpinner({
          prefixText: `${Log.prefixes.info} Creating an optimized production build`,
        })
      }

      NextBuildContext.buildSpinner = buildSpinner

      const validFileMatcher = createValidFileMatcher(
        config.pageExtensions,
        appDir
      )

      const pagesPaths =
        !appDirOnly && pagesDir
          ? await nextBuildSpan
              .traceChild('collect-pages')
              .traceAsyncFn(() =>
                recursiveReadDir(pagesDir, validFileMatcher.isPageFile)
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
      const rootPaths = (
        await flatReaddir(rootDir, [
          middlewareDetectionRegExp,
          ...(instrumentationHookEnabled
            ? [instrumentationHookDetectionRegExp]
            : []),
        ])
      ).map((absoluteFile) => absoluteFile.replace(dir, ''))

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
            recursiveReadDir(
              appDir,
              (absolutePath) =>
                validFileMatcher.isAppRouterPage(absolutePath) ||
                // For now we only collect the root /not-found page in the app
                // directory as the 404 fallback
                validFileMatcher.isRootNotFound(absolutePath),
              undefined,
              (part) => part.startsWith('_')
            )
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
        const hasPublicUnderScoreNextDir = await fileExists(
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
              'file'
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

      const buildCustomRoute = (
        r: {
          source: string
          locale?: false
          basePath?: false
          statusCode?: number
          destination?: string
        },
        type: RouteType
      ) => {
        const keys: any[] = []

        const routeRegex = pathToRegexp(r.source, keys, {
          strict: true,
          sensitive: false,
          delimiter: '/', // default is `/#?`, but Next does not pass query info
        })
        let regexSource = routeRegex.source

        if (!(r as any).internal) {
          regexSource = modifyRouteRegex(
            routeRegex.source,
            type === 'redirect' ? restrictedRedirectPaths : undefined
          )
        }

        return {
          ...r,
          ...(type === 'redirect'
            ? {
                statusCode: getRedirectStatus(r as Redirect),
                permanent: undefined,
              }
            : {}),
          regex: normalizeRouteRegex(regexSource),
        }
      }

      const routesManifestPath = path.join(distDir, ROUTES_MANIFEST)
      const routesManifest: {
        version: number
        pages404: boolean
        basePath: string
        redirects: Array<ReturnType<typeof buildCustomRoute>>
        rewrites?:
          | Array<ReturnType<typeof buildCustomRoute>>
          | {
              beforeFiles: Array<ReturnType<typeof buildCustomRoute>>
              afterFiles: Array<ReturnType<typeof buildCustomRoute>>
              fallback: Array<ReturnType<typeof buildCustomRoute>>
            }
        headers: Array<ReturnType<typeof buildCustomRoute>>
        staticRoutes: Array<{
          page: string
          regex: string
          namedRegex?: string
          routeKeys?: { [key: string]: string }
        }>
        dynamicRoutes: Array<{
          page: string
          regex: string
          namedRegex?: string
          routeKeys?: { [key: string]: string }
        }>
        dataRoutes: Array<{
          page: string
          routeKeys?: { [key: string]: string }
          dataRouteRegex: string
          namedDataRouteRegex?: string
        }>
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
          header: typeof RSC
          varyHeader: typeof RSC_VARY_HEADER
        }
        skipMiddlewareUrlNormalize?: boolean
      } = nextBuildSpan.traceChild('generate-routes-manifest').traceFn(() => {
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
          basePath: config.basePath,
          redirects: redirects.map((r: any) => buildCustomRoute(r, 'redirect')),
          headers: headers.map((r: any) => buildCustomRoute(r, 'header')),
          dynamicRoutes,
          staticRoutes,
          dataRoutes: [],
          i18n: config.i18n || undefined,
          rsc: {
            header: RSC,
            varyHeader: RSC_VARY_HEADER,
            contentTypeHeader: RSC_CONTENT_TYPE_HEADER,
          },
          skipMiddlewareUrlNormalize: config.skipMiddlewareUrlNormalize,
        }
      })

      if (rewrites.beforeFiles.length === 0 && rewrites.fallback.length === 0) {
        routesManifest.rewrites = rewrites.afterFiles.map((r: any) =>
          buildCustomRoute(r, 'rewrite')
        )
      } else {
        routesManifest.rewrites = {
          beforeFiles: rewrites.beforeFiles.map((r: any) =>
            buildCustomRoute(r, 'rewrite')
          ),
          afterFiles: rewrites.afterFiles.map((r: any) =>
            buildCustomRoute(r, 'rewrite')
          ),
          fallback: rewrites.fallback.map((r: any) =>
            buildCustomRoute(r, 'rewrite')
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
            await promises.mkdir(distDir, { recursive: true })
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

      if (config.cleanDistDir && !isGenerate) {
        await recursiveDelete(distDir, /^cache/)
      }

      // Ensure commonjs handling is used for files in the distDir (generally .next)
      // Files outside of the distDir can be "type": "module"
      await promises.writeFile(
        path.join(distDir, 'package.json'),
        '{"type": "commonjs"}'
      )

      // We need to write the manifest with rewrites before build
      await nextBuildSpan
        .traceChild('write-routes-manifest')
        .traceAsyncFn(() =>
          promises.writeFile(
            routesManifestPath,
            JSON.stringify(routesManifest),
            'utf8'
          )
        )

      const outputFileTracingRoot =
        config.experimental.outputFileTracingRoot || dir

      const manifestPath = path.join(distDir, SERVER_DIRECTORY, PAGES_MANIFEST)

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
            },
          },
          appDir: dir,
          relativeAppDir: path.relative(outputFileTracingRoot, dir),
          files: [
            ROUTES_MANIFEST,
            path.relative(distDir, manifestPath),
            BUILD_MANIFEST,
            PRERENDER_MANIFEST,
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
                  APP_BUILD_MANIFEST,
                  path.join(
                    SERVER_DIRECTORY,
                    CLIENT_REFERENCE_MANIFEST + '.js'
                  ),
                  path.join(
                    SERVER_DIRECTORY,
                    CLIENT_REFERENCE_MANIFEST + '.json'
                  ),
                  path.join(
                    SERVER_DIRECTORY,
                    FLIGHT_SERVER_CSS_MANIFEST + '.js'
                  ),
                  path.join(
                    SERVER_DIRECTORY,
                    FLIGHT_SERVER_CSS_MANIFEST + '.json'
                  ),
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
            appDir ? path.join(SERVER_DIRECTORY, APP_PATHS_MANIFEST) : null,
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

      let binding = (await loadBindings()) as any

      async function turbopackBuild() {
        const turboNextBuildStart = process.hrtime()
        await binding.turbo.nextBuild(NextBuildContext)
        const [duration] = process.hrtime(turboNextBuildStart)
        return { duration, turbotraceContext: null }
      }

      let runTurbotrace = async (_staticPages: Set<string>) => {}
      let turboTasksForTrace: unknown

      if (!isGenerate) {
        const { duration: webpackBuildDuration, turbotraceContext } =
          turboNextBuild ? await turbopackBuild() : await webpackBuild()

        telemetry.record(
          eventBuildCompleted(pagesPaths, {
            durationInSeconds: webpackBuildDuration,
            totalAppPagesCount,
          })
        )

        runTurbotrace = async function (staticPages: Set<string>) {
          if (!turbotraceContext) {
            return
          }
          if (
            !binding?.isWasm &&
            typeof binding.turbo.startTrace === 'function'
          ) {
            let turbotraceOutputPath: string | undefined
            let turbotraceFiles: string[] | undefined
            turboTasksForTrace = binding.turbo.createTurboTasks(
              (config.experimental.turbotrace?.memoryLimit ??
                TURBO_TRACE_DEFAULT_MEMORY_LIMIT) *
                1024 *
                1024
            )

            const { entriesTrace, chunksTrace } = turbotraceContext
            if (entriesTrace) {
              const {
                appDir: turbotraceContextAppDir,
                depModArray,
                entryNameMap,
                outputPath,
                action,
              } = entriesTrace
              const depModSet = new Set(depModArray)
              const filesTracedInEntries: string[] =
                await binding.turbo.startTrace(action, turboTasksForTrace)

              const { contextDirectory, input: entriesToTrace } = action

              // only trace the assets under the appDir
              // exclude files from node_modules, entries and processed by webpack
              const filesTracedFromEntries = filesTracedInEntries
                .map((f) => path.join(contextDirectory, f))
                .filter(
                  (f) =>
                    !f.includes('/node_modules/') &&
                    f.startsWith(turbotraceContextAppDir) &&
                    !entriesToTrace.includes(f) &&
                    !depModSet.has(f)
                )
              if (filesTracedFromEntries.length) {
                // The turbo trace doesn't provide the traced file type and reason at present
                // let's write the traced files into the first [entry].nft.json
                const [[, entryName]] = Array.from<[string, string]>(
                  entryNameMap.entries()
                ).filter(([k]) => k.startsWith(turbotraceContextAppDir))
                const traceOutputPath = path.join(
                  outputPath,
                  `../${entryName}.js.nft.json`
                )
                const traceOutputDir = path.dirname(traceOutputPath)

                turbotraceOutputPath = traceOutputPath
                turbotraceFiles = filesTracedFromEntries.map((file) =>
                  path.relative(traceOutputDir, file)
                )
              }
            }
            if (chunksTrace) {
              const { action, outputPath } = chunksTrace
              action.input = action.input.filter((f: any) => {
                const outputPagesPath = path.join(outputPath, '..', 'pages')
                return (
                  !f.startsWith(outputPagesPath) ||
                  !staticPages.has(
                    // strip `outputPagesPath` and file ext from absolute
                    f.substring(outputPagesPath.length, f.length - 3)
                  )
                )
              })
              await binding.turbo.startTrace(action, turboTasksForTrace)
              if (turbotraceOutputPath && turbotraceFiles) {
                const existedNftFile = await promises
                  .readFile(turbotraceOutputPath, 'utf8')
                  .then((existedContent) => JSON.parse(existedContent))
                  .catch(() => ({
                    version: TRACE_OUTPUT_VERSION,
                    files: [],
                  }))
                existedNftFile.files.push(...turbotraceFiles)
                const filesSet = new Set(existedNftFile.files)
                existedNftFile.files = [...filesSet]
                await promises.writeFile(
                  turbotraceOutputPath,
                  JSON.stringify(existedNftFile),
                  'utf8'
                )
              }
            }
          }
        }
      }

      // For app directory, we run type checking after build.
      if (appDir && !(isCompile || isGenerate)) {
        await startTypeChecking(typeCheckingOptions)
      }

      const postCompileSpinner = createSpinner({
        prefixText: `${Log.prefixes.info} Collecting page data`,
      })

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
      const appStaticPathsEncoded = new Map<string, Array<string>>()
      const appNormalizedPaths = new Map<string, string>()
      const appDynamicParamPaths = new Set<string>()
      const appDefaultConfigs = new Map<string, AppConfig>()
      const pageInfos = new Map<string, PageInfo>()
      const pagesManifest = JSON.parse(
        await promises.readFile(manifestPath, 'utf8')
      ) as PagesManifest
      const buildManifest = JSON.parse(
        await promises.readFile(buildManifestPath, 'utf8')
      ) as BuildManifest
      const appBuildManifest = appDir
        ? (JSON.parse(
            await promises.readFile(appBuildManifestPath, 'utf8')
          ) as AppBuildManifest)
        : undefined

      const timeout = config.staticPageGenerationTimeout || 0
      const sharedPool = config.experimental.sharedPool || false
      const staticWorkerPath = sharedPool
        ? require.resolve('./worker')
        : require.resolve('./utils')

      let appPathsManifest: Record<string, string> = {}
      const appPathRoutes: Record<string, string> = {}

      if (appDir) {
        appPathsManifest = JSON.parse(
          await promises.readFile(
            path.join(distDir, SERVER_DIRECTORY, APP_PATHS_MANIFEST),
            'utf8'
          )
        )

        Object.keys(appPathsManifest).forEach((entry) => {
          appPathRoutes[entry] = normalizeAppPath(entry)
        })
        await promises.writeFile(
          path.join(distDir, APP_PATH_ROUTES_MANIFEST),
          JSON.stringify(appPathRoutes, null, 2)
        )
      }

      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

      // We limit the number of workers used based on the number of CPUs and
      // the current available memory. This is to prevent the system from
      // running out of memory as well as maximize speed. We assume that
      // each worker will consume ~1GB of memory in a production build.
      // For example, if the system has 10 CPU cores and 8GB of remaining memory
      // we will use 8 workers.
      const numWorkers = Math.max(
        config.experimental.cpus !== defaultConfig.experimental!.cpus
          ? (config.experimental.cpus as number)
          : Math.min(
              config.experimental.cpus || 1,
              Math.floor(os.freemem() / 1e9)
            ),
        // enforce a minimum of 4 workers
        4
      )

      function createStaticWorker(type: 'app' | 'pages') {
        const numWorkersPerType = isAppDirEnabled
          ? Math.max(1, ~~(numWorkers / 2))
          : numWorkers

        let infoPrinted = false

        return new Worker(staticWorkerPath, {
          timeout: timeout * 1000,
          onRestart: (method, [arg], attempts) => {
            if (method === 'exportPage') {
              const { path: pagePath } = arg
              if (attempts >= 3) {
                throw new Error(
                  `Static page generation for ${pagePath} is still timing out after 3 attempts. See more info here https://nextjs.org/docs/messages/static-page-generation-timeout`
                )
              }
              Log.warn(
                `Restarted static page generation for ${pagePath} because it took more than ${timeout} seconds`
              )
            } else {
              const pagePath = arg
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
          numWorkers: numWorkersPerType,
          forkOptions: {
            env: {
              ...process.env,
              __NEXT_PRIVATE_PREBUNDLED_REACT:
                type === 'app'
                  ? config.experimental.serverActions
                    ? 'experimental'
                    : 'next'
                  : '',
            },
          },
          enableWorkerThreads: config.experimental.workerThreads,
          computeWorkerKey(method, ...args) {
            if (method === 'exportPage') {
              const typedArgs = args as Parameters<
                typeof import('./worker').exportPage
              >
              return typedArgs[0].pathMap.page
            } else if (method === 'isPageStatic') {
              const typedArgs = args as Parameters<
                typeof import('./worker').isPageStatic
              >
              return typedArgs[0].originalAppPath || typedArgs[0].page
            }
            return method
          },
          exposedMethods: sharedPool
            ? [
                'hasCustomGetInitialProps',
                'isPageStatic',
                'getNamedExports',
                'exportPage',
              ]
            : ['hasCustomGetInitialProps', 'isPageStatic', 'getNamedExports'],
        }) as Worker &
          Pick<
            typeof import('./worker'),
            | 'hasCustomGetInitialProps'
            | 'isPageStatic'
            | 'getNamedExports'
            | 'exportPage'
          >
      }

      const pagesStaticWorkers = createStaticWorker('pages')
      const appStaticWorkers = isAppDirEnabled
        ? createStaticWorker('app')
        : undefined

      const analysisBegin = process.hrtime()
      const staticCheckSpan = nextBuildSpan.traceChild('static-check')
      const {
        customAppGetInitialProps,
        namedExports,
        isNextImageImported,
        hasSsrAmpPages,
        hasNonStaticErrorPage,
      } = await staticCheckSpan.traceAsyncFn(async () => {
        if (isCompile) {
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
              page: '/_error',
              distDir,
              configFileName,
              runtimeEnvConfig,
              httpAgentOptions: config.httpAgentOptions,
              locales: config.i18n?.locales,
              defaultLocale: config.i18n?.defaultLocale,
              nextConfigOutput: config.output,
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

        const namedExportsPromise = pagesStaticWorkers.getNamedExports(
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
                const [selfSize, allSize] = await getJsPageSizeInKb(
                  pageType,
                  actualPage,
                  distDir,
                  buildManifest,
                  appBuildManifest,
                  config.experimental.gzipSize,
                  computedManifestData
                )

                let isSsg = false
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

                const staticInfo = pagePath
                  ? await getPageStaticInfo({
                      pageFilePath: path.join(
                        (pageType === 'pages' ? pagesDir : appDir) || '',
                        pagePath
                      ),
                      nextConfig: config,
                      pageType,
                    })
                  : undefined

                const pageRuntime = middlewareManifest.functions[
                  originalAppPath || page
                ]
                  ? 'edge'
                  : staticInfo?.runtime

                if (!isCompile) {
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
                            page,
                            originalAppPath,
                            distDir,
                            configFileName,
                            runtimeEnvConfig,
                            httpAgentOptions: config.httpAgentOptions,
                            locales: config.i18n?.locales,
                            defaultLocale: config.i18n?.defaultLocale,
                            parentId: isPageStaticSpan.id,
                            pageRuntime,
                            edgeInfo,
                            pageType,
                            hasServerComponents: !!appDir,
                            incrementalCacheHandlerPath:
                              config.experimental.incrementalCacheHandlerPath,
                            isrFlushToDisk: config.experimental.isrFlushToDisk,
                            maxMemoryCacheSize:
                              config.experimental.isrMemoryCacheSize,
                            nextConfigOutput: config.output,
                          })
                        }
                      )

                      if (pageType === 'app' && originalAppPath) {
                        appNormalizedPaths.set(originalAppPath, page)
                        // TODO-APP: handle prerendering with edge
                        if (isEdgeRuntime(pageRuntime)) {
                          isStatic = false
                          isSsg = false
                        } else {
                          // If a page has action and it is static, we need to
                          // change it to SSG to keep the worker created.
                          // TODO: This is a workaround for now, we should have a
                          // dedicated worker defined in a heuristic way.
                          const hasAction = entriesWithAction?.has(
                            'app' + originalAppPath
                          )

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
                            isSsg = true
                          }

                          const appConfig = workerResult.appConfig || {}
                          if (appConfig.revalidate !== 0 && !hasAction) {
                            const isDynamic = isDynamicRoute(page)
                            const hasGenerateStaticParams =
                              !!workerResult.prerenderRoutes?.length

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
                            }
                          }

                          if (workerResult.prerenderFallback) {
                            // whether or not to allow requests for paths not
                            // returned from generateStaticParams
                            appDynamicParamPaths.add(originalAppPath)
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
                          isSsg = true

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
                          isSsg = true
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
                    if (isSsg || isStatic) {
                      staticAppPagesCount++
                    } else {
                      serverAppPagesCount++
                    }
                  }
                }

                pageInfos.set(page, {
                  size: selfSize,
                  totalSize: allSize,
                  static: isStatic,
                  isSsg,
                  isHybridAmp,
                  ssgPageRoutes,
                  initialRevalidateSeconds: false,
                  runtime: pageRuntime,
                  pageDuration: undefined,
                  ssgPageDurations: undefined,
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

        if (!sharedPool) {
          pagesStaticWorkers.end()
          appStaticWorkers?.end()
        }

        return returnValue
      })

      await runTurbotrace(staticPages)

      if (customAppGetInitialProps) {
        console.warn(
          chalk.bold.yellow(`Warning: `) +
            chalk.yellow(
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

      const nextServerTraceOutput = path.join(
        distDir,
        'next-server.js.nft.json'
      )

      if (!isGenerate && config.outputFileTracing) {
        let nodeFileTrace: any
        if (config.experimental.turbotrace) {
          if (!binding?.isWasm) {
            nodeFileTrace = binding.turbo.startTrace
          }
        }

        if (!nodeFileTrace) {
          nodeFileTrace =
            require('next/dist/compiled/@vercel/nft').nodeFileTrace
        }

        const includeExcludeSpan = nextBuildSpan.traceChild(
          'apply-include-excludes'
        )
        const resolvedTraceIncludes = new Map<string, string[]>()
        const {
          outputFileTracingIncludes = {},
          outputFileTracingExcludes = {},
        } = config.experimental

        const includeGlobKeys = Object.keys(outputFileTracingIncludes)
        const excludeGlobKeys = Object.keys(outputFileTracingExcludes)

        await includeExcludeSpan.traceAsyncFn(async () => {
          const globOrig =
            require('next/dist/compiled/glob') as typeof import('next/dist/compiled/glob')
          const glob = (pattern: string): Promise<string[]> => {
            return new Promise((resolve, reject) => {
              globOrig(
                pattern,
                { cwd: dir, nodir: true, dot: true },
                (err, files) => {
                  if (err) {
                    return reject(err)
                  }
                  resolve(files)
                }
              )
            })
          }

          if (config.outputFileTracing) {
            for (let page of pageKeys.pages) {
              const combinedIncludes = new Set<string>()
              const combinedExcludes = new Set<string>()

              page = normalizePagePath(page)

              for (const curGlob of includeGlobKeys) {
                if (isMatch(page, [curGlob])) {
                  outputFileTracingIncludes[curGlob].forEach((include) => {
                    combinedIncludes.add(include)
                  })
                }
              }

              for (const curGlob of excludeGlobKeys) {
                if (isMatch(page, [curGlob])) {
                  outputFileTracingExcludes[curGlob].forEach((exclude) => {
                    combinedExcludes.add(exclude)
                  })
                }
              }

              if (!combinedIncludes?.size && !combinedExcludes?.size) {
                continue
              }

              const traceFile = path.join(
                distDir,
                'server/pages',
                `${page}.js.nft.json`
              )
              const pageDir = path.dirname(traceFile)
              const traceContent = JSON.parse(
                await promises.readFile(traceFile, 'utf8')
              )
              const includes: string[] = []

              if (combinedIncludes?.size) {
                await Promise.all(
                  [...combinedIncludes].map(async (includeGlob) => {
                    const results = await glob(includeGlob)
                    const resolvedInclude = resolvedTraceIncludes.get(
                      includeGlob
                    ) || [
                      ...results.map((file) => {
                        return path.relative(pageDir, path.join(dir, file))
                      }),
                    ]
                    includes.push(...resolvedInclude)
                    resolvedTraceIncludes.set(includeGlob, resolvedInclude)
                  })
                )
              }
              const combined = new Set([...traceContent.files, ...includes])

              if (combinedExcludes?.size) {
                const resolvedGlobs = [...combinedExcludes].map((exclude) =>
                  path.join(dir, exclude)
                )
                combined.forEach((file) => {
                  if (isMatch(path.join(pageDir, file), resolvedGlobs)) {
                    combined.delete(file)
                  }
                })
              }

              await promises.writeFile(
                traceFile,
                JSON.stringify({
                  version: traceContent.version,
                  files: [...combined],
                })
              )
            }
          }
        })

        await nextBuildSpan
          .traceChild('trace-next-server')
          .traceAsyncFn(async () => {
            let cacheKey: string | undefined
            // consider all lockFiles in tree in case user accidentally
            // has both package-lock.json and yarn.lock
            const lockFiles: string[] = (
              await Promise.all(
                ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].map(
                  (file) => findUp(file, { cwd: dir })
                )
              )
            ).filter(Boolean) as any // TypeScript doesn't like this filter

            const cachedTracePath = path.join(
              distDir,
              'cache/next-server.js.nft.json'
            )

            if (
              lockFiles.length > 0 &&
              // we can't leverage trace cache if this is configured
              // currently unless we break this to a separate trace
              // file
              !config.experimental.incrementalCacheHandlerPath
            ) {
              const cacheHash = (
                require('crypto') as typeof import('crypto')
              ).createHash('sha256')

              cacheHash.update(require('next/package').version)
              cacheHash.update(hasSsrAmpPages + '')
              cacheHash.update(ciEnvironment.hasNextSupport + '')

              await Promise.all(
                lockFiles.map(async (lockFile) => {
                  cacheHash.update(await promises.readFile(lockFile))
                })
              )
              cacheKey = cacheHash.digest('hex')

              try {
                const existingTrace = JSON.parse(
                  await promises.readFile(cachedTracePath, 'utf8')
                )

                if (existingTrace.cacheKey === cacheKey) {
                  await promises.copyFile(
                    cachedTracePath,
                    nextServerTraceOutput
                  )
                  return
                }
              } catch (_) {}
            }

            const root =
              config.experimental?.turbotrace?.contextDirectory ??
              outputFileTracingRoot

            // Under standalone mode, we need to trace the extra IPC server and
            // worker files.
            const isStandalone = config.output === 'standalone'

            const nextServerEntry = require.resolve(
              'next/dist/server/next-server'
            )
            const toTrace = [
              nextServerEntry,
              isStandalone
                ? require.resolve(
                    'next/dist/server/lib/render-server-standalone'
                  )
                : null,
            ].filter(nonNullable)

            // ensure we trace any dependencies needed for custom
            // incremental cache handler
            if (incrementalCacheHandlerPath) {
              toTrace.push(
                require.resolve(
                  path.isAbsolute(incrementalCacheHandlerPath)
                    ? incrementalCacheHandlerPath
                    : path.join(dir, incrementalCacheHandlerPath)
                )
              )
            }

            let serverResult: import('next/dist/compiled/@vercel/nft').NodeFileTraceResult

            const additionalIgnores = new Set<string>()

            for (const glob of excludeGlobKeys) {
              if (isMatch('next-server', glob)) {
                outputFileTracingExcludes[glob].forEach((exclude) => {
                  additionalIgnores.add(exclude)
                })
              }
            }
            const ignores = [
              '**/*.d.ts',
              '**/*.map',
              '**/next/dist/pages/**/*',
              isStandalone ? null : '**/next/dist/compiled/jest-worker/**/*',
              '**/next/dist/compiled/webpack/(bundle4|bundle5).js',
              '**/node_modules/webpack5/**/*',
              '**/next/dist/server/lib/squoosh/**/*.wasm',
              '**/next/dist/server/lib/route-resolver*',
              ...(ciEnvironment.hasNextSupport
                ? [
                    // only ignore image-optimizer code when
                    // this is being handled outside of next-server
                    '**/next/dist/server/image-optimizer.js',
                    '**/node_modules/sharp/**/*',
                  ]
                : []),
              ...(!hasSsrAmpPages
                ? ['**/next/dist/compiled/@ampproject/toolbox-optimizer/**/*']
                : []),
              ...additionalIgnores,
            ].filter(nonNullable)

            const ignoreFn = (pathname: string) => {
              if (path.isAbsolute(pathname) && !pathname.startsWith(root)) {
                return true
              }

              return isMatch(pathname, ignores, {
                contains: true,
                dot: true,
              })
            }
            const traceContext = path.join(nextServerEntry, '..', '..')
            const tracedFiles = new Set<string>()

            function addToTracedFiles(base: string, file: string) {
              tracedFiles.add(
                path
                  .relative(distDir, path.join(base, file))
                  .replace(/\\/g, '/')
              )
            }

            if (isStandalone) {
              addToTracedFiles(
                '',
                require.resolve('next/dist/compiled/jest-worker/processChild')
              )
              addToTracedFiles(
                '',
                require.resolve('next/dist/compiled/jest-worker/threadChild')
              )
            }

            if (config.experimental.turbotrace) {
              const files: string[] = await nodeFileTrace(
                {
                  action: 'print',
                  input: toTrace,
                  contextDirectory: traceContext,
                  logLevel: config.experimental.turbotrace.logLevel,
                  processCwd: config.experimental.turbotrace.processCwd,
                  logDetail: config.experimental.turbotrace.logDetail,
                  showAll: config.experimental.turbotrace.logAll,
                },
                turboTasksForTrace
              )
              for (const file of files) {
                if (!ignoreFn(path.join(traceContext, file))) {
                  addToTracedFiles(traceContext, file)
                }
              }
            } else {
              serverResult = await nodeFileTrace(toTrace, {
                base: root,
                processCwd: dir,
                ignore: ignoreFn,
              })

              serverResult.fileList.forEach((file) => {
                addToTracedFiles(root, file)
              })
            }
            await promises.writeFile(
              nextServerTraceOutput,
              JSON.stringify({
                version: 1,
                cacheKey,
                files: Array.from(tracedFiles),
              } as {
                version: number
                files: string[]
              })
            )
            await promises.unlink(cachedTracePath).catch(() => {})
            await promises
              .copyFile(nextServerTraceOutput, cachedTracePath)
              .catch(() => {})
          })
      }

      if (serverPropsPages.size > 0 || ssgPages.size > 0) {
        // We update the routes manifest after the build with the
        // data routes since we can't determine these until after build
        routesManifest.dataRoutes = getSortedRoutes([
          ...serverPropsPages,
          ...ssgPages,
        ]).map((page) => {
          const pagePath = normalizePagePath(page)
          const dataRoute = path.posix.join(
            '/_next/data',
            buildId,
            `${pagePath}.json`
          )

          let dataRouteRegex: string
          let namedDataRouteRegex: string | undefined
          let routeKeys: { [named: string]: string } | undefined

          if (isDynamicRoute(page)) {
            const routeRegex = getNamedRouteRegex(
              dataRoute.replace(/\.json$/, ''),
              true
            )

            dataRouteRegex = normalizeRouteRegex(
              routeRegex.re.source.replace(/\(\?:\\\/\)\?\$$/, `\\.json$`)
            )
            namedDataRouteRegex = routeRegex.namedRegex!.replace(
              /\(\?:\/\)\?\$$/,
              `\\.json$`
            )
            routeKeys = routeRegex.routeKeys
          } else {
            dataRouteRegex = normalizeRouteRegex(
              new RegExp(
                `^${path.posix.join(
                  '/_next/data',
                  escapeStringRegexp(buildId),
                  `${pagePath}.json`
                )}$`
              ).source
            )
          }

          return {
            page,
            routeKeys,
            dataRouteRegex,
            namedDataRouteRegex,
          }
        })

        await promises.writeFile(
          routesManifestPath,
          JSON.stringify(routesManifest),
          'utf8'
        )
      }

      // Since custom _app.js can wrap the 404 page we have to opt-out of static optimization if it has getInitialProps
      // Only export the static 404 when there is no /_error present
      const useStatic404 =
        !customAppGetInitialProps &&
        (!hasNonStaticErrorPage || hasPages404 || hasApp404)

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

      await promises.writeFile(
        path.join(distDir, SERVER_FILES_MANIFEST),
        JSON.stringify(requiredServerFiles),
        'utf8'
      )

      const middlewareManifest: MiddlewareManifest = JSON.parse(
        await promises.readFile(
          path.join(distDir, SERVER_DIRECTORY, MIDDLEWARE_MANIFEST),
          'utf8'
        )
      )

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
              hasInstrumentationHook
            )
          })
      }

      const finalPrerenderRoutes: { [route: string]: SsgRoute } = {}
      const finalDynamicRoutes: PrerenderManifest['dynamicRoutes'] = {}
      const tbdPrerenderRoutes: string[] = []
      let ssgNotFoundPaths: string[] = []

      if (postCompileSpinner) postCompileSpinner.stopAndPersist()

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

      // we need to trigger automatic exporting when we have
      // - static 404/500
      // - getStaticProps paths
      // - experimental app is enabled
      if (
        !isCompile &&
        (combinedPages.length > 0 ||
          useStatic404 ||
          useDefaultStatic500 ||
          isAppDirEnabled)
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
          const exportApp: typeof import('../export').default =
            require('../export').default

          const exportConfig: NextConfigComplete = {
            ...config,
            initialPageRevalidationMap: {},
            initialPageMetaMap: {},
            pageDurationMap: {},
            ssgNotFoundPaths: [] as string[],
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

              if (useStatic404) {
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

              if (i18n) {
                for (const page of [
                  ...staticPages,
                  ...ssgPages,
                  ...(useStatic404 ? ['/404'] : []),
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

          const exportOptions: ExportOptions = {
            isInvokedFromCli: false,
            nextConfig: exportConfig,
            hasAppDir,
            silent: false,
            buildExport: true,
            debugOutput,
            threads: config.experimental.cpus,
            pages: combinedPages,
            outdir: path.join(distDir, 'export'),
            statusMessage: 'Generating static pages',
            exportAppPageWorker: sharedPool
              ? appStaticWorkers?.exportPage.bind(appStaticWorkers)
              : undefined,
            exportPageWorker: sharedPool
              ? pagesStaticWorkers.exportPage.bind(pagesStaticWorkers)
              : undefined,
            endWorker: sharedPool
              ? async () => {
                  await pagesStaticWorkers.end()
                  await appStaticWorkers?.end()
                }
              : undefined,
          }

          await exportApp(dir, exportOptions, nextBuildSpan)

          const postBuildSpinner = createSpinner({
            prefixText: `${Log.prefixes.info} Finalizing page optimization`,
          })
          ssgNotFoundPaths = exportConfig.ssgNotFoundPaths

          // remove server bundles that were exported
          for (const page of staticPages) {
            const serverBundle = getPagePath(page, distDir, undefined, false)
            await promises.unlink(serverBundle)
          }

          for (const [originalAppPath, routes] of appStaticPaths) {
            const page = appNormalizedPaths.get(originalAppPath) || ''
            const appConfig = appDefaultConfigs.get(originalAppPath) || {}
            let hasDynamicData =
              appConfig.revalidate === 0 ||
              exportConfig.initialPageRevalidationMap[page] === 0

            const isRouteHandler = isAppRouteRoute(originalAppPath)

            routes.forEach((route) => {
              if (isDynamicRoute(page) && route === page) return
              if (route === '/_not-found') return

              let revalidate = exportConfig.initialPageRevalidationMap[route]

              if (typeof revalidate === 'undefined') {
                revalidate =
                  typeof appConfig.revalidate !== 'undefined'
                    ? appConfig.revalidate
                    : false
              }

              // ensure revalidate is normalized correctly
              if (
                typeof revalidate !== 'number' &&
                typeof revalidate !== 'boolean'
              ) {
                revalidate = false
              }

              if (revalidate !== 0) {
                const normalizedRoute = normalizePagePath(route)
                const dataRoute = isRouteHandler
                  ? null
                  : path.posix.join(`${normalizedRoute}.rsc`)

                const routeMeta: {
                  initialStatus?: SsgRoute['initialStatus']
                  initialHeaders?: SsgRoute['initialHeaders']
                } = {}

                const exportRouteMeta: {
                  status?: number
                  headers?: Record<string, string>
                } = exportConfig.initialPageMetaMap[route] || {}

                if (exportRouteMeta.status !== 200) {
                  routeMeta.initialStatus = exportRouteMeta.status
                }
                const exportHeaders = exportRouteMeta.headers
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
                  initialRevalidateSeconds: revalidate,
                  srcRoute: page,
                  dataRoute,
                }
              } else {
                hasDynamicData = true
                // we might have determined during prerendering that this page
                // used dynamic data
                pageInfos.set(route, {
                  ...(pageInfos.get(route) as PageInfo),
                  isSsg: false,
                  static: false,
                })
              }
            })

            if (!hasDynamicData && isDynamicRoute(originalAppPath)) {
              const normalizedRoute = normalizePagePath(page)
              const dataRoute = path.posix.join(`${normalizedRoute}.rsc`)

              // TODO: create a separate manifest to allow enforcing
              // dynamicParams for non-static paths?
              finalDynamicRoutes[page] = {
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
                  await promises.mkdir(path.dirname(dest), { recursive: true })
                  await promises.rename(orig, dest)
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
                    await promises.mkdir(path.dirname(updatedDest), {
                      recursive: true,
                    })
                    await promises.rename(updatedOrig, updatedDest)
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

                if (await fileExists(orig)) {
                  await promises.copyFile(
                    orig,
                    path.join(distDir, 'server', updatedRelativeDest)
                  )
                  pagesManifest['/404'] = updatedRelativeDest
                }
              })
          }

          // If there's /not-found inside app, we prefer it over the pages 404
          if (hasApp404 && useStatic404) {
            // await moveExportedPage('/_error', '/404', '/404', false, 'html')
            await moveExportedAppNotFoundTo404()
          } else {
            // Only move /404 to /404 when there is no custom 404 as in that case we don't know about the 404 page
            if (!hasPages404 && useStatic404) {
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
            const durationInfo = exportConfig.pageDurationMap[page]
            if (pageInfo && durationInfo) {
              // Set Build Duration
              if (pageInfo.ssgPageRoutes) {
                pageInfo.ssgPageDurations = pageInfo.ssgPageRoutes.map(
                  (pagePath) => durationInfo[pagePath]
                )
              }
              pageInfo.pageDuration = durationInfo[page]
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
                        exportConfig.initialPageRevalidationMap[localePage],
                      srcRoute: null,
                      dataRoute: path.posix.join(
                        '/_next/data',
                        buildId,
                        `${file}.json`
                      ),
                    }
                  }
                } else {
                  finalPrerenderRoutes[page] = {
                    initialRevalidateSeconds:
                      exportConfig.initialPageRevalidationMap[page],
                    srcRoute: null,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${file}.json`
                    ),
                  }
                }
                // Set Page Revalidation Interval
                if (pageInfo) {
                  pageInfo.initialRevalidateSeconds =
                    exportConfig.initialPageRevalidationMap[page]
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

                  finalPrerenderRoutes[route] = {
                    initialRevalidateSeconds:
                      exportConfig.initialPageRevalidationMap[route],
                    srcRoute: page,
                    dataRoute: path.posix.join(
                      '/_next/data',
                      buildId,
                      `${normalizePagePath(route)}.json`
                    ),
                  }

                  // Set route Revalidation Interval
                  if (pageInfo) {
                    pageInfo.initialRevalidateSeconds =
                      exportConfig.initialPageRevalidationMap[route]
                  }
                }
              }
            }
          }

          // remove temporary export folder
          await recursiveDelete(exportOptions.outdir)
          await promises.rmdir(exportOptions.outdir)
          await promises.writeFile(
            manifestPath,
            JSON.stringify(pagesManifest, null, 2),
            'utf8'
          )

          if (postBuildSpinner) postBuildSpinner.stopAndPersist()
          console.log()
        })
      }

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
          hasStatic404: useStatic404,
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

      if (NextBuildContext.telemetryPlugin) {
        const events = eventBuildFeatureUsage(NextBuildContext.telemetryPlugin)
        telemetry.record(events)
        telemetry.record(
          eventPackageUsedInGetServerSideProps(NextBuildContext.telemetryPlugin)
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
          }
        })
        const prerenderManifest: PrerenderManifest = {
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

        await promises.writeFile(
          path.join(distDir, PRERENDER_MANIFEST),
          JSON.stringify(prerenderManifest),
          'utf8'
        )
        await promises.writeFile(
          path.join(distDir, PRERENDER_MANIFEST).replace(/\.json$/, '.js'),
          `self.__PRERENDER_MANIFEST=${JSON.stringify(prerenderManifest)}`,
          'utf8'
        )
        await generateClientSsgManifest(prerenderManifest, {
          distDir,
          buildId,
          locales: config.i18n?.locales || [],
        })
      } else {
        const prerenderManifest: PrerenderManifest = {
          version: 4,
          routes: {},
          dynamicRoutes: {},
          preview: previewProps,
          notFoundRoutes: [],
        }
        await promises.writeFile(
          path.join(distDir, PRERENDER_MANIFEST),
          JSON.stringify(prerenderManifest),
          'utf8'
        )
        await promises.writeFile(
          path.join(distDir, PRERENDER_MANIFEST).replace(/\.json$/, '.js'),
          `self.__PRERENDER_MANIFEST=${JSON.stringify(prerenderManifest)}`,
          'utf8'
        )
      }

      const images = { ...config.images }
      const { deviceSizes, imageSizes } = images
      ;(images as any).sizes = [...deviceSizes, ...imageSizes]
      ;(images as any).remotePatterns = (
        config?.images?.remotePatterns || []
      ).map((p: RemotePattern) => ({
        // Should be the same as matchRemotePattern()
        protocol: p.protocol,
        hostname: makeRe(p.hostname).source,
        port: p.port,
        pathname: makeRe(p.pathname ?? '**').source,
      }))

      await promises.writeFile(
        path.join(distDir, IMAGES_MANIFEST),
        JSON.stringify({
          version: 1,
          images,
        }),
        'utf8'
      )
      await promises.writeFile(
        path.join(distDir, EXPORT_MARKER),
        JSON.stringify({
          version: 1,
          hasExportPathMap: typeof config.exportPathMap === 'function',
          exportTrailingSlash: config.trailingSlash === true,
          isNextImageImported: isNextImageImported === true,
        }),
        'utf8'
      )
      await promises.unlink(path.join(distDir, EXPORT_DETAIL)).catch((err) => {
        if (err.code === 'ENOENT') {
          return Promise.resolve()
        }
        return Promise.reject(err)
      })

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
          await promises.mkdir(path.dirname(outputPath), {
            recursive: true,
          })
          await promises.copyFile(filePath, outputPath)
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
          await recursiveCopy(
            path.join(distDir, SERVER_DIRECTORY, 'app'),
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

      await nextBuildSpan.traceChild('print-tree-view').traceAsyncFn(() =>
        printTreeView(pageKeys, pageInfos, {
          distPath: distDir,
          buildId: buildId,
          pagesDir,
          useStatic404,
          pageExtensions: config.pageExtensions,
          appBuildManifest,
          buildManifest,
          middlewareManifest,
          gzipSize: config.experimental.gzipSize,
        })
      )

      if (debugOutput) {
        nextBuildSpan
          .traceChild('print-custom-routes')
          .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
      }

      if (config.analyticsId) {
        console.log(
          chalk.bold.green('Next.js Speed Insights') +
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
        const exportApp: typeof import('../export').default =
          require('../export').default

        const pagesWorker = createStaticWorker('pages')
        const appWorker = createStaticWorker('app')

        const options: ExportOptions = {
          isInvokedFromCli: false,
          nextConfig: config,
          hasAppDir,
          silent: true,
          threads: config.experimental.cpus,
          outdir: path.join(dir, configOutDir),
          exportAppPageWorker: sharedPool
            ? appWorker.exportPage.bind(appWorker)
            : undefined,
          exportPageWorker: sharedPool
            ? pagesWorker.exportPage.bind(pagesWorker)
            : undefined,
          endWorker: sharedPool
            ? async () => {
                await pagesWorker.end()
                await appWorker.end()
              }
            : undefined,
        }

        await exportApp(dir, options, nextBuildSpan)

        // ensure the worker is not left hanging
        pagesWorker.close()
        appWorker.close()
      }

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
