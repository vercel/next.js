import type { webpack5 as webpack } from 'next/dist/compiled/webpack/webpack'
import { loadEnvConfig } from '@next/env'
import chalk from 'next/dist/compiled/chalk'
import crypto from 'crypto'
import { isMatch } from 'next/dist/compiled/micromatch'
import { promises, writeFileSync } from 'fs'
import { Worker } from '../lib/worker'
import devalue from 'next/dist/compiled/devalue'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'
import findUp from 'next/dist/compiled/find-up'
import { nanoid } from 'next/dist/compiled/nanoid/index.cjs'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import path, { join } from 'path'
import formatWebpackMessages from '../client/dev/error-overlay/format-webpack-messages'
import {
  STATIC_STATUS_PAGE_GET_INITIAL_PROPS_ERROR,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
  MIDDLEWARE_ROUTE,
  PAGES_DIR_ALIAS,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { findPagesDir } from '../lib/find-pages-dir'
import loadCustomRoutes, {
  CustomRoutes,
  getRedirectStatus,
  modifyRouteRegex,
  normalizeRouteRegex,
  Redirect,
  Rewrite,
  RouteType,
} from '../lib/load-custom-routes'
import { nonNullable } from '../lib/non-nullable'
import { recursiveDelete } from '../lib/recursive-delete'
import { verifyAndLint } from '../lib/verifyAndLint'
import { verifyPartytownSetup } from '../lib/verify-partytown-setup'
import { verifyTypeScriptSetup } from '../lib/verifyTypeScriptSetup'
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
  MIDDLEWARE_FLIGHT_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
  SERVER_FILES_MANIFEST,
  STATIC_STATUS_PAGES,
  MIDDLEWARE_MANIFEST,
} from '../shared/lib/constants'
import {
  getRouteRegex,
  getSortedRoutes,
  isDynamicRoute,
} from '../shared/lib/router/utils'
import { __ApiPreviewProps } from '../server/api-utils'
import loadConfig from '../server/config'
import { isTargetLikeServerless } from '../server/utils'
import { BuildManifest } from '../server/get-page-files'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { getPagePath } from '../server/require'
import * as ciEnvironment from '../telemetry/ci-info'
import {
  eventBuildCompleted,
  eventBuildOptimize,
  eventCliSession,
  eventBuildFeatureUsage,
  eventNextPlugins,
  eventTypeCheckCompleted,
  EVENT_BUILD_FEATURE_USAGE,
  EventBuildFeatureUsage,
  eventPackageUsedInGetServerSideProps,
} from '../telemetry/events'
import { Telemetry } from '../telemetry/storage'
import { runCompiler } from './compiler'
import {
  createEntrypoints,
  createPagesMapping,
  getPageRuntime,
} from './entries'
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
  getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage,
  getUnresolvedModuleFromError,
  copyTracedFiles,
  isReservedPage,
  isCustomErrorPage,
  isServerComponentPage,
} from './utils'
import getBaseWebpackConfig from './webpack-config'
import { PagesManifest } from './webpack/plugins/pages-manifest-plugin'
import { writeBuildId } from './write-build-id'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { NextConfigComplete } from '../server/config-shared'
import isError, { NextError } from '../lib/is-error'
import { TelemetryPlugin } from './webpack/plugins/telemetry-plugin'
import { MiddlewareManifest } from './webpack/plugins/middleware-plugin'
import { recursiveCopy } from '../lib/recursive-copy'
import { recursiveReadDir } from '../lib/recursive-readdir'
import { lockfilePatchPromise, teardownTraceSubscriber } from './swc'

export type SsgRoute = {
  initialRevalidateSeconds: number | false
  srcRoute: string | null
  dataRoute: string
}

export type DynamicSsgRoute = {
  routeRegex: string
  fallback: string | null | false
  dataRoute: string
  dataRouteRegex: string
}

export type PrerenderManifest = {
  version: 3
  routes: { [route: string]: SsgRoute }
  dynamicRoutes: { [route: string]: DynamicSsgRoute }
  notFoundRoutes: string[]
  preview: __ApiPreviewProps
}

type CompilerResult = {
  errors: webpack.StatsError[]
  warnings: webpack.StatsError[]
  stats: [
    webpack.Stats | undefined,
    webpack.Stats | undefined,
    webpack.Stats | undefined
  ]
}

export default async function build(
  dir: string,
  conf = null,
  reactProductionProfiling = false,
  debugOutput = false,
  runLint = true
): Promise<void> {
  try {
    const nextBuildSpan = trace('next-build', undefined, {
      version: process.env.__NEXT_VERSION as string,
    })

    const buildResult = await nextBuildSpan.traceAsyncFn(async () => {
      // attempt to load global env values so they are available in next.config.js
      const { loadedEnvFiles } = nextBuildSpan
        .traceChild('load-dotenv')
        .traceFn(() => loadEnvConfig(dir, false, Log))

      const config: NextConfigComplete = await nextBuildSpan
        .traceChild('load-next-config')
        .traceAsyncFn(() => loadConfig(PHASE_PRODUCTION_BUILD, dir, conf))

      const distDir = path.join(dir, config.distDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      setGlobal('distDir', distDir)

      // We enable concurrent features (Fizz-related rendering architecture) when
      // using React 18 or experimental.
      const hasReactRoot = !!process.env.__NEXT_REACT_ROOT
      const hasServerComponents =
        hasReactRoot && !!config.experimental.serverComponents

      const { target } = config
      const buildId: string = await nextBuildSpan
        .traceChild('generate-buildid')
        .traceAsyncFn(() => generateBuildId(config.generateBuildId, nanoid))

      const customRoutes: CustomRoutes = await nextBuildSpan
        .traceChild('load-custom-routes')
        .traceAsyncFn(() => loadCustomRoutes(config))

      const { headers, rewrites, redirects } = customRoutes

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
      const { pages: pagesDir, views: viewsDir } = findPagesDir(
        dir,
        config.experimental.viewsDir
      )

      const hasPublicDir = await fileExists(publicDir)

      telemetry.record(
        eventCliSession(dir, config, {
          webpackVersion: 5,
          cliCommand: 'build',
          isSrcDir: path.relative(dir, pagesDir!).startsWith('src'),
          hasNowJson: !!(await findUp('now.json', { cwd: dir })),
          isCustomServer: null,
        })
      )

      eventNextPlugins(path.resolve(dir)).then((events) =>
        telemetry.record(events)
      )

      const ignoreTypeScriptErrors = Boolean(
        config.typescript.ignoreBuildErrors
      )
      const typeCheckStart = process.hrtime()
      const typeCheckingSpinner = createSpinner({
        prefixText: `${Log.prefixes.info} ${
          ignoreTypeScriptErrors
            ? 'Skipping validation of types'
            : 'Checking validity of types'
        }`,
      })

      const verifyResult = await nextBuildSpan
        .traceChild('verify-typescript-setup')
        .traceAsyncFn(() =>
          verifyTypeScriptSetup(
            dir,
            [pagesDir, viewsDir].filter(Boolean) as string[],
            !ignoreTypeScriptErrors,
            config,
            cacheDir
          )
        )

      const typeCheckEnd = process.hrtime(typeCheckStart)

      if (!ignoreTypeScriptErrors) {
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

      if (typeCheckingSpinner) {
        typeCheckingSpinner.stopAndPersist()
      }

      const ignoreESLint = Boolean(config.eslint.ignoreDuringBuilds)
      const eslintCacheDir = path.join(cacheDir, 'eslint/')
      const shouldLint = !ignoreESLint && runLint
      if (shouldLint) {
        await nextBuildSpan
          .traceChild('verify-and-lint')
          .traceAsyncFn(async () => {
            await verifyAndLint(
              dir,
              eslintCacheDir,
              config.eslint?.dirs,
              config.experimental.cpus,
              config.experimental.workerThreads,
              telemetry
            )
          })
      }
      const buildLintEvent: EventBuildFeatureUsage = {
        featureName: 'build-lint',
        invocationCount: shouldLint ? 1 : 0,
      }
      telemetry.record({
        eventName: EVENT_BUILD_FEATURE_USAGE,
        payload: buildLintEvent,
      })

      const buildSpinner = createSpinner({
        prefixText: `${Log.prefixes.info} Creating an optimized production build`,
      })

      const isLikeServerless = isTargetLikeServerless(target)

      const pagePaths = await nextBuildSpan
        .traceChild('collect-pages')
        .traceAsyncFn(() =>
          recursiveReadDir(
            pagesDir,
            new RegExp(`\\.(?:${config.pageExtensions.join('|')})$`)
          )
        )

      let viewPaths: string[] | undefined

      if (viewsDir) {
        viewPaths = await nextBuildSpan
          .traceChild('collect-view-paths')
          .traceAsyncFn(() =>
            recursiveReadDir(
              viewsDir,
              new RegExp(`page\\.(?:${config.pageExtensions.join('|')})$`)
            )
          )
      }

      // needed for static exporting since we want to replace with HTML
      // files

      const allStaticPages = new Set<string>()
      let allPageInfos = new Map<string, PageInfo>()

      const previewProps: __ApiPreviewProps = {
        previewModeId: crypto.randomBytes(16).toString('hex'),
        previewModeSigningKey: crypto.randomBytes(32).toString('hex'),
        previewModeEncryptionKey: crypto.randomBytes(32).toString('hex'),
      }

      const mappedPages = nextBuildSpan
        .traceChild('create-pages-mapping')
        .traceFn(() =>
          createPagesMapping({
            hasServerComponents,
            isDev: false,
            pageExtensions: config.pageExtensions,
            pagePaths,
          })
        )

      let mappedViewPaths: ReturnType<typeof createPagesMapping> | undefined

      if (viewPaths && viewsDir) {
        mappedViewPaths = nextBuildSpan
          .traceChild('create-views-mapping')
          .traceFn(() =>
            createPagesMapping({
              pagePaths: viewPaths!,
              hasServerComponents,
              isDev: false,
              isViews: true,
              pageExtensions: config.pageExtensions,
            })
          )
      }

      const entrypoints = await nextBuildSpan
        .traceChild('create-entrypoints')
        .traceAsyncFn(() =>
          createEntrypoints({
            buildId,
            config,
            envFiles: loadedEnvFiles,
            isDev: false,
            pages: mappedPages,
            pagesDir,
            previewMode: previewProps,
            target,
            viewsDir,
            viewPaths: mappedViewPaths,
            pageExtensions: config.pageExtensions,
          })
        )

      const pageKeys = Object.keys(mappedPages)
      const conflictingPublicFiles: string[] = []
      const hasPages404 = mappedPages['/404']?.startsWith(PAGES_DIR_ALIAS)
      const hasCustomErrorPage =
        mappedPages['/_error'].startsWith(PAGES_DIR_ALIAS)

      if (pageKeys.some((page) => MIDDLEWARE_ROUTE.test(page))) {
        Log.warn(
          `using beta Middleware (not covered by semver) - https://nextjs.org/docs/messages/beta-middleware`
        )
      }

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

      const nestedReservedPages = pageKeys.filter((page) => {
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
      } = nextBuildSpan.traceChild('generate-routes-manifest').traceFn(() => ({
        version: 3,
        pages404: true,
        basePath: config.basePath,
        redirects: redirects.map((r: any) => buildCustomRoute(r, 'redirect')),
        headers: headers.map((r: any) => buildCustomRoute(r, 'header')),
        dynamicRoutes: getSortedRoutes(pageKeys)
          .filter(
            (page) => isDynamicRoute(page) && !page.match(MIDDLEWARE_ROUTE)
          )
          .map(pageToRoute),
        staticRoutes: getSortedRoutes(pageKeys)
          .filter(
            (page) =>
              !isDynamicRoute(page) &&
              !page.match(MIDDLEWARE_ROUTE) &&
              !isReservedPage(page)
          )
          .map(pageToRoute),
        dataRoutes: [],
        i18n: config.i18n || undefined,
      }))

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

      if (config.cleanDistDir) {
        await recursiveDelete(distDir, /^cache/)
      }

      // Ensure commonjs handling is used for files in the distDir (generally .next)
      // Files outside of the distDir can be "type": "module"
      await promises.writeFile(
        path.join(distDir, 'package.json'),
        '{"type": "commonjs"}'
      )

      // We need to write the manifest with rewrites before build
      // so serverless can import the manifest
      await nextBuildSpan
        .traceChild('write-routes-manifest')
        .traceAsyncFn(() =>
          promises.writeFile(
            routesManifestPath,
            JSON.stringify(routesManifest),
            'utf8'
          )
        )

      const serverDir = isLikeServerless
        ? SERVERLESS_DIRECTORY
        : SERVER_DIRECTORY
      const manifestPath = path.join(distDir, serverDir, PAGES_MANIFEST)

      const requiredServerFiles = nextBuildSpan
        .traceChild('generate-required-server-files')
        .traceFn(() => ({
          version: 1,
          config: {
            ...config,
            configFile: undefined,
            experimental: {
              ...config.experimental,
              trustHostHeader: ciEnvironment.hasNextSupport,
            },
          },
          appDir: dir,
          files: [
            ROUTES_MANIFEST,
            path.relative(distDir, manifestPath),
            BUILD_MANIFEST,
            PRERENDER_MANIFEST,
            path.join(SERVER_DIRECTORY, MIDDLEWARE_MANIFEST),
            ...(hasServerComponents
              ? [
                  path.join(
                    SERVER_DIRECTORY,
                    MIDDLEWARE_FLIGHT_MANIFEST + '.js'
                  ),
                  path.join(
                    SERVER_DIRECTORY,
                    MIDDLEWARE_FLIGHT_MANIFEST + '.json'
                  ),
                ]
              : []),
            REACT_LOADABLE_MANIFEST,
            config.optimizeFonts ? path.join(serverDir, FONT_MANIFEST) : null,
            BUILD_ID_FILE,
          ]
            .filter(nonNullable)
            .map((file) => path.join(config.distDir, file)),
          ignore: [] as string[],
        }))

      let result: CompilerResult = {
        warnings: [],
        errors: [],
        stats: [undefined, undefined, undefined],
      }
      let webpackBuildStart
      let telemetryPlugin
      await (async () => {
        // IIFE to isolate locals and avoid retaining memory too long
        const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')

        const commonWebpackOptions = {
          buildId,
          config,
          hasReactRoot,
          pagesDir,
          reactProductionProfiling,
          rewrites,
          runWebpackSpan,
          target,
          viewsDir,
        }

        const configs = await runWebpackSpan
          .traceChild('generate-webpack-config')
          .traceAsyncFn(() =>
            Promise.all([
              getBaseWebpackConfig(dir, {
                ...commonWebpackOptions,
                compilerType: 'client',
                entrypoints: entrypoints.client,
              }),
              getBaseWebpackConfig(dir, {
                ...commonWebpackOptions,
                compilerType: 'server',
                entrypoints: entrypoints.server,
              }),
              getBaseWebpackConfig(dir, {
                ...commonWebpackOptions,
                compilerType: 'edge-server',
                entrypoints: entrypoints.edgeServer,
              }),
            ])
          )

        const clientConfig = configs[0]

        if (
          clientConfig.optimization &&
          (clientConfig.optimization.minimize !== true ||
            (clientConfig.optimization.minimizer &&
              clientConfig.optimization.minimizer.length === 0))
        ) {
          Log.warn(
            `Production code optimization has been disabled in your project. Read more: https://nextjs.org/docs/messages/minification-disabled`
          )
        }

        webpackBuildStart = process.hrtime()

        // We run client and server compilation separately to optimize for memory usage
        await runWebpackSpan.traceAsyncFn(async () => {
          const clientResult = await runCompiler(clientConfig, {
            runWebpackSpan,
          })
          // Fail build if clientResult contains errors
          if (clientResult.errors.length > 0) {
            result = {
              warnings: [...clientResult.warnings],
              errors: [...clientResult.errors],
              stats: [clientResult.stats, undefined, undefined],
            }
          } else {
            const serverResult = await runCompiler(configs[1], {
              runWebpackSpan,
            })
            const edgeServerResult = configs[2]
              ? await runCompiler(configs[2], { runWebpackSpan })
              : null

            result = {
              warnings: [
                ...clientResult.warnings,
                ...serverResult.warnings,
                ...(edgeServerResult?.warnings || []),
              ],
              errors: [
                ...clientResult.errors,
                ...serverResult.errors,
                ...(edgeServerResult?.errors || []),
              ],
              stats: [
                clientResult.stats,
                serverResult.stats,
                edgeServerResult?.stats,
              ],
            }
          }
        })
        result = nextBuildSpan
          .traceChild('format-webpack-messages')
          .traceFn(() => formatWebpackMessages(result, true))

        telemetryPlugin = (clientConfig as webpack.Configuration).plugins?.find(
          isTelemetryPlugin
        )
      })()
      const webpackBuildEnd = process.hrtime(webpackBuildStart)
      if (buildSpinner) {
        buildSpinner.stopAndPersist()
      }

      if (result.errors.length > 0) {
        // Only keep the first few errors. Others are often indicative
        // of the same problem, but confuse the reader with noise.
        if (result.errors.length > 5) {
          result.errors.length = 5
        }
        let error = result.errors.join('\n\n')

        console.error(chalk.red('Failed to compile.\n'))

        if (
          error.indexOf('private-next-pages') > -1 &&
          error.indexOf('does not contain a default export') > -1
        ) {
          const page_name_regex = /'private-next-pages\/(?<page_name>[^']*)'/
          const parsed = page_name_regex.exec(error)
          const page_name = parsed && parsed.groups && parsed.groups.page_name
          throw new Error(
            `webpack build failed: found page without a React Component as default export in pages/${page_name}\n\nSee https://nextjs.org/docs/messages/page-without-valid-component for more info.`
          )
        }

        console.error(error)
        console.error()

        const edgeRuntimeErrors = result.stats[2]?.compilation.errors ?? []

        for (const err of edgeRuntimeErrors) {
          // When using the web runtime, common Node.js native APIs are not available.
          const moduleName = getUnresolvedModuleFromError(err.message)
          if (!moduleName) continue

          const e = new Error(
            getNodeBuiltinModuleNotSupportedInEdgeRuntimeMessage(moduleName)
          ) as NextError
          e.code = 'EDGE_RUNTIME_UNSUPPORTED_API'
          throw e
        }

        if (
          error.indexOf('private-next-pages') > -1 ||
          error.indexOf('__next_polyfill__') > -1
        ) {
          const err = new Error(
            'webpack config.resolve.alias was incorrectly overridden. https://nextjs.org/docs/messages/invalid-resolve-alias'
          ) as NextError
          err.code = 'INVALID_RESOLVE_ALIAS'
          throw err
        }
        const err = new Error(
          'Build failed because of webpack errors'
        ) as NextError
        err.code = 'WEBPACK_ERRORS'
        throw err
      } else {
        telemetry.record(
          eventBuildCompleted(pagePaths, {
            durationInSeconds: webpackBuildEnd[0],
          })
        )

        if (result.warnings.length > 0) {
          Log.warn('Compiled with warnings\n')
          console.warn(result.warnings.join('\n\n'))
          console.warn()
        } else {
          Log.info('Compiled successfully')
        }
      }

      const postCompileSpinner = createSpinner({
        prefixText: `${Log.prefixes.info} Collecting page data`,
      })

      const buildManifestPath = path.join(distDir, BUILD_MANIFEST)

      const ssgPages = new Set<string>()
      const ssgStaticFallbackPages = new Set<string>()
      const ssgBlockingFallbackPages = new Set<string>()
      const staticPages = new Set<string>()
      const invalidPages = new Set<string>()
      const hybridAmpPages = new Set<string>()
      const serverPropsPages = new Set<string>()
      const additionalSsgPaths = new Map<string, Array<string>>()
      const additionalSsgPathsEncoded = new Map<string, Array<string>>()
      const pageTraceIncludes = new Map<string, Array<string>>()
      const pageTraceExcludes = new Map<string, Array<string>>()
      const pageInfos = new Map<string, PageInfo>()
      const pagesManifest = JSON.parse(
        await promises.readFile(manifestPath, 'utf8')
      ) as PagesManifest
      const buildManifest = JSON.parse(
        await promises.readFile(buildManifestPath, 'utf8')
      ) as BuildManifest

      const timeout = config.staticPageGenerationTimeout || 0
      const sharedPool = config.experimental.sharedPool || false
      const staticWorker = sharedPool
        ? require.resolve('./worker')
        : require.resolve('./utils')
      let infoPrinted = false

      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD

      const staticWorkers = new Worker(staticWorker, {
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
        numWorkers: config.experimental.cpus,
        enableWorkerThreads: config.experimental.workerThreads,
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

      const analysisBegin = process.hrtime()
      const staticCheckSpan = nextBuildSpan.traceChild('static-check')
      const {
        customAppGetInitialProps,
        namedExports,
        isNextImageImported,
        hasSsrAmpPages,
        hasNonStaticErrorPage,
      } = await staticCheckSpan.traceAsyncFn(async () => {
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
              (await staticWorkers.hasCustomGetInitialProps(
                '/_error',
                distDir,
                isLikeServerless,
                runtimeEnvConfig,
                false
              ))
          )

        const errorPageStaticResult = nonStaticErrorPageSpan.traceAsyncFn(
          async () =>
            hasCustomErrorPage &&
            staticWorkers.isPageStatic(
              '/_error',
              distDir,
              isLikeServerless,
              configFileName,
              runtimeEnvConfig,
              config.httpAgentOptions,
              config.i18n?.locales,
              config.i18n?.defaultLocale
            )
        )

        // we don't output _app in serverless mode so use _app export
        // from _error instead
        const appPageToCheck = isLikeServerless ? '/_error' : '/_app'

        const customAppGetInitialPropsPromise =
          staticWorkers.hasCustomGetInitialProps(
            appPageToCheck,
            distDir,
            isLikeServerless,
            runtimeEnvConfig,
            true
          )

        const namedExportsPromise = staticWorkers.getNamedExports(
          appPageToCheck,
          distDir,
          isLikeServerless,
          runtimeEnvConfig
        )

        // eslint-disable-next-line no-shadow
        let isNextImageImported: boolean | undefined
        // eslint-disable-next-line no-shadow
        let hasSsrAmpPages = false

        const computedManifestData = await computeFromManifest(
          buildManifest,
          distDir,
          config.experimental.gzipSize
        )

        await Promise.all(
          pageKeys.map(async (page) => {
            const checkPageSpan = staticCheckSpan.traceChild('check-page', {
              page,
            })
            return checkPageSpan.traceAsyncFn(async () => {
              const actualPage = normalizePagePath(page)
              const [selfSize, allSize] = await getJsPageSizeInKb(
                actualPage,
                distDir,
                buildManifest,
                config.experimental.gzipSize,
                computedManifestData
              )

              let isSsg = false
              let isStatic = false
              let isServerComponent = false
              let isHybridAmp = false
              let ssgPageRoutes: string[] | null = null
              let isMiddlewareRoute = !!page.match(MIDDLEWARE_ROUTE)

              const pagePath = pagePaths.find(
                (p) =>
                  p.startsWith(actualPage + '.') ||
                  p.startsWith(actualPage + '/index.')
              )
              const pageRuntime = pagePath
                ? await getPageRuntime(join(pagesDir, pagePath), config)
                : undefined

              if (hasServerComponents && pagePath) {
                if (isServerComponentPage(config, pagePath)) {
                  isServerComponent = true
                }
              }

              if (
                !isMiddlewareRoute &&
                !isReservedPage(page) &&
                // We currently don't support static optimization in the Edge runtime.
                pageRuntime !== 'edge'
              ) {
                try {
                  let isPageStaticSpan =
                    checkPageSpan.traceChild('is-page-static')
                  let workerResult = await isPageStaticSpan.traceAsyncFn(() => {
                    return staticWorkers.isPageStatic(
                      page,
                      distDir,
                      isLikeServerless,
                      configFileName,
                      runtimeEnvConfig,
                      config.httpAgentOptions,
                      config.i18n?.locales,
                      config.i18n?.defaultLocale,
                      isPageStaticSpan.id
                    )
                  })

                  if (config.outputFileTracing) {
                    pageTraceIncludes.set(
                      page,
                      workerResult.traceIncludes || []
                    )
                    pageTraceExcludes.set(
                      page,
                      workerResult.traceExcludes || []
                    )
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
                      additionalSsgPaths.set(page, workerResult.prerenderRoutes)
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
                } catch (err) {
                  if (!isError(err) || err.message !== 'INVALID_DEFAULT_EXPORT')
                    throw err
                  invalidPages.add(page)
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
                runtime:
                  !isReservedPage(page) && !isCustomErrorPage(page)
                    ? pageRuntime
                    : undefined,
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

        if (!sharedPool) staticWorkers.end()
        return returnValue
      })

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

      if (config.outputFileTracing) {
        const { nodeFileTrace } =
          require('next/dist/compiled/@vercel/nft') as typeof import('next/dist/compiled/@vercel/nft')

        const includeExcludeSpan = nextBuildSpan.traceChild(
          'apply-include-excludes'
        )

        await includeExcludeSpan.traceAsyncFn(async () => {
          const globOrig =
            require('next/dist/compiled/glob') as typeof import('next/dist/compiled/glob')
          const glob = (pattern: string): Promise<string[]> => {
            return new Promise((resolve, reject) => {
              globOrig(pattern, { cwd: dir }, (err, files) => {
                if (err) {
                  return reject(err)
                }
                resolve(files)
              })
            })
          }

          for (let page of pageKeys) {
            await includeExcludeSpan
              .traceChild('include-exclude', { page })
              .traceAsyncFn(async () => {
                const includeGlobs = pageTraceIncludes.get(page)
                const excludeGlobs = pageTraceExcludes.get(page)
                page = normalizePagePath(page)

                if (!includeGlobs?.length && !excludeGlobs?.length) {
                  return
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
                let includes: string[] = []

                if (includeGlobs?.length) {
                  for (const includeGlob of includeGlobs) {
                    const results = await glob(includeGlob)
                    includes.push(
                      ...results.map((file) => {
                        return path.relative(pageDir, path.join(dir, file))
                      })
                    )
                  }
                }
                const combined = new Set([...traceContent.files, ...includes])

                if (excludeGlobs?.length) {
                  const resolvedGlobs = excludeGlobs.map((exclude) =>
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
              })
          }
        })

        // TODO: move this inside of webpack so it can be cached
        // between builds. Should only need to be re-run on lockfile change
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

            const nextServerTraceOutput = path.join(
              distDir,
              'next-server.js.nft.json'
            )
            const cachedTracePath = path.join(
              distDir,
              'cache/next-server.js.nft.json'
            )

            if (lockFiles.length > 0) {
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

            const root = path.parse(dir).root
            const serverResult = await nodeFileTrace(
              [require.resolve('next/dist/server/next-server')],
              {
                base: root,
                processCwd: dir,
                ignore: [
                  '**/next/dist/pages/**/*',
                  '**/next/dist/compiled/webpack/(bundle4|bundle5).js',
                  '**/node_modules/webpack5/**/*',
                  '**/next/dist/server/lib/squoosh/**/*.wasm',
                  ...(ciEnvironment.hasNextSupport
                    ? [
                        // only ignore image-optimizer code when
                        // this is being handled outside of next-server
                        '**/next/dist/server/image-optimizer.js',
                        '**/node_modules/sharp/**/*',
                      ]
                    : []),
                  ...(!hasSsrAmpPages
                    ? [
                        '**/next/dist/compiled/@ampproject/toolbox-optimizer/**/*',
                      ]
                    : []),
                ],
              }
            )

            const tracedFiles = new Set()

            serverResult.fileList.forEach((file) => {
              tracedFiles.add(
                path
                  .relative(distDir, path.join(root, file))
                  .replace(/\\/g, '/')
              )
            })

            await promises.writeFile(
              nextServerTraceOutput,
              JSON.stringify({
                version: 1,
                cacheKey,
                files: [...tracedFiles],
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
            const routeRegex = getRouteRegex(dataRoute.replace(/\.json$/, ''))

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
            { cwd: join(distDir, 'static') },
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
          path.join(distDir, serverDir, MIDDLEWARE_MANIFEST),
          'utf8'
        )
      )

      const outputFileTracingRoot =
        config.experimental.outputFileTracingRoot || dir

      if (config.experimental.outputStandalone) {
        await nextBuildSpan
          .traceChild('copy-traced-files')
          .traceAsyncFn(async () => {
            await copyTracedFiles(
              dir,
              distDir,
              pageKeys,
              outputFileTracingRoot,
              requiredServerFiles.config,
              middlewareManifest
            )
          })
      }

      const finalPrerenderRoutes: { [route: string]: SsgRoute } = {}
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

      if (combinedPages.length > 0 || useStatic404 || useDefaultStatic500) {
        const staticGenerationSpan =
          nextBuildSpan.traceChild('static-generation')
        await staticGenerationSpan.traceAsyncFn(async () => {
          detectConflictingPaths(
            [
              ...combinedPages,
              ...pageKeys.filter((page) => !combinedPages.includes(page)),
            ],
            ssgPages,
            additionalSsgPaths
          )
          const exportApp: typeof import('../export').default =
            require('../export').default
          const exportOptions = {
            silent: false,
            buildExport: true,
            threads: config.experimental.cpus,
            pages: combinedPages,
            outdir: path.join(distDir, 'export'),
            statusMessage: 'Generating static pages',
            exportPageWorker: sharedPool
              ? staticWorkers.exportPage.bind(staticWorkers)
              : undefined,
            endWorker: sharedPool
              ? async () => {
                  await staticWorkers.end()
                }
              : undefined,
          }
          const exportConfig: any = {
            ...config,
            initialPageRevalidationMap: {},
            pageDurationMap: {},
            ssgNotFoundPaths: [] as string[],
            // Default map will be the collection of automatic statically exported
            // pages and incremental pages.
            // n.b. we cannot handle this above in combinedPages because the dynamic
            // page must be in the `pages` array, but not in the mapping.
            exportPathMap: (defaultMap: any) => {
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
                        query: { __nextFallback: true },
                      }
                    } else {
                      defaultMap[page] = {
                        page,
                        query: { __nextFallback: true },
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
                      query: { __nextLocale: locale },
                    }

                    if (isFallback) {
                      defaultMap[outputPath].query.__nextFallback = true
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

          await exportApp(dir, exportOptions, nextBuildSpan, exportConfig)

          const postBuildSpinner = createSpinner({
            prefixText: `${Log.prefixes.info} Finalizing page optimization`,
          })
          ssgNotFoundPaths = exportConfig.ssgNotFoundPaths

          // remove server bundles that were exported
          for (const page of staticPages) {
            const serverBundle = getPagePath(page, distDir, isLikeServerless)
            await promises.unlink(serverBundle)
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
                  isLikeServerless
                )

                const relativeDest = path
                  .relative(
                    path.join(distDir, serverDir),
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

                const dest = path.join(distDir, serverDir, relativeDest)
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
                      serverDir,
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

          // Only move /404 to /404 when there is no custom 404 as in that case we don't know about the 404 page
          if (!hasPages404 && useStatic404) {
            await moveExportedPage('/_error', '/404', '/404', false, 'html')
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
      staticWorkers.close()

      const analysisEnd = process.hrtime(analysisBegin)
      telemetry.record(
        eventBuildOptimize(pagePaths, {
          durationInSeconds: analysisEnd[0],
          staticPageCount: staticPages.size,
          staticPropsPageCount: ssgPages.size,
          serverPropsPageCount: serverPropsPages.size,
          ssrPageCount:
            pagePaths.length -
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
          middlewareCount: pageKeys.filter((page) =>
            MIDDLEWARE_ROUTE.test(page)
          ).length,
        })
      )

      if (telemetryPlugin) {
        const events = eventBuildFeatureUsage(telemetryPlugin)
        telemetry.record(events)
        telemetry.record(eventPackageUsedInGetServerSideProps(telemetryPlugin))
      }

      if (ssgPages.size > 0) {
        const finalDynamicRoutes: PrerenderManifest['dynamicRoutes'] = {}
        tbdPrerenderRoutes.forEach((tbdRoute) => {
          const normalizedRoute = normalizePagePath(tbdRoute)
          const dataRoute = path.posix.join(
            '/_next/data',
            buildId,
            `${normalizedRoute}.json`
          )

          finalDynamicRoutes[tbdRoute] = {
            routeRegex: normalizeRouteRegex(getRouteRegex(tbdRoute).re.source),
            dataRoute,
            fallback: ssgBlockingFallbackPages.has(tbdRoute)
              ? null
              : ssgStaticFallbackPages.has(tbdRoute)
              ? `${normalizedRoute}.html`
              : false,
            dataRouteRegex: normalizeRouteRegex(
              getRouteRegex(dataRoute.replace(/\.json$/, '')).re.source.replace(
                /\(\?:\\\/\)\?\$$/,
                '\\.json$'
              )
            ),
          }
        })
        const prerenderManifest: PrerenderManifest = {
          version: 3,
          routes: finalPrerenderRoutes,
          dynamicRoutes: finalDynamicRoutes,
          notFoundRoutes: ssgNotFoundPaths,
          preview: previewProps,
        }

        await promises.writeFile(
          path.join(distDir, PRERENDER_MANIFEST),
          JSON.stringify(prerenderManifest),
          'utf8'
        )
        await generateClientSsgManifest(prerenderManifest, {
          distDir,
          buildId,
          locales: config.i18n?.locales || [],
        })
      } else {
        const prerenderManifest: PrerenderManifest = {
          version: 3,
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
      }

      await promises.writeFile(
        path.join(
          distDir,
          CLIENT_STATIC_FILES_PATH,
          buildId,
          '_middlewareManifest.js'
        ),
        `self.__MIDDLEWARE_MANIFEST=${devalue(
          middlewareManifest.clientInfo
        )};self.__MIDDLEWARE_MANIFEST_CB&&self.__MIDDLEWARE_MANIFEST_CB()`
      )

      const images = { ...config.images }
      const { deviceSizes, imageSizes } = images
      ;(images as any).sizes = [...deviceSizes, ...imageSizes]
      ;(images as any).remotePatterns =
        config?.experimental?.images?.remotePatterns || []

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

      if (config.experimental.outputStandalone) {
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
      }

      staticPages.forEach((pg) => allStaticPages.add(pg))
      pageInfos.forEach((info: PageInfo, key: string) => {
        allPageInfos.set(key, info)
      })

      await nextBuildSpan.traceChild('print-tree-view').traceAsyncFn(() =>
        printTreeView(
          Object.keys(mappedPages),
          allPageInfos,
          isLikeServerless,
          {
            distPath: distDir,
            buildId: buildId,
            pagesDir,
            useStatic404,
            pageExtensions: config.pageExtensions,
            buildManifest,
            gzipSize: config.experimental.gzipSize,
          }
        )
      )

      if (debugOutput) {
        nextBuildSpan
          .traceChild('print-custom-routes')
          .traceFn(() => printCustomRoutes({ redirects, rewrites, headers }))
      }

      if (config.analyticsId) {
        console.log(
          chalk.bold.green('Next.js Analytics') +
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
              join(distDir, CLIENT_STATIC_FILES_PATH)
            )
          })
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
  }
}

function generateClientSsgManifest(
  prerenderManifest: PrerenderManifest,
  {
    buildId,
    distDir,
    locales,
  }: { buildId: string; distDir: string; locales: string[] }
) {
  const ssgPages = new Set<string>([
    ...Object.entries(prerenderManifest.routes)
      // Filter out dynamic routes
      .filter(([, { srcRoute }]) => srcRoute == null)
      .map(([route]) => normalizeLocalePath(route, locales).pathname),
    ...Object.keys(prerenderManifest.dynamicRoutes),
  ])

  const clientSsgManifestContent = `self.__SSG_MANIFEST=${devalue(
    ssgPages
  )};self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()`

  writeFileSync(
    path.join(distDir, CLIENT_STATIC_FILES_PATH, buildId, '_ssgManifest.js'),
    clientSsgManifestContent
  )
}

function isTelemetryPlugin(plugin: unknown): plugin is TelemetryPlugin {
  return plugin instanceof TelemetryPlugin
}

function pageToRoute(page: string) {
  const routeRegex = getRouteRegex(page)
  return {
    page,
    regex: normalizeRouteRegex(routeRegex.re.source),
    routeKeys: routeRegex.routeKeys,
    namedRegex: routeRegex.namedRegex,
  }
}
