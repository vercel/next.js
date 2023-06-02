import type { CustomRoutes } from '../../lib/load-custom-routes'
import type { FindComponentsResult } from '../next-server'
import type { LoadComponentsReturnType } from '../load-components'
import type { Options as ServerOptions } from '../next-server'
import type { Params } from '../../shared/lib/router/utils/route-matcher'
import type { ParsedUrl } from '../../shared/lib/router/utils/parse-url'
import type { ParsedUrlQuery } from 'querystring'
import type { Server as HTTPServer } from 'http'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { MiddlewareRoutingItem, RoutingItem } from '../base-server'
import type { MiddlewareMatcher } from '../../build/analysis/get-page-static-info'
import type { FunctionComponent } from 'react'
import type { RouteMatch } from '../future/route-matches/route-match'

import fs from 'fs'
import { Worker } from 'next/dist/compiled/jest-worker'
import findUp from 'next/dist/compiled/find-up'
import { join as pathJoin, relative, resolve as pathResolve, sep } from 'path'
import Watchpack from 'next/dist/compiled/watchpack'
import { ampValidation } from '../../build/output'
import {
  INSTRUMENTATION_HOOK_FILENAME,
  PUBLIC_DIR_MIDDLEWARE_CONFLICT,
} from '../../lib/constants'
import { fileExists } from '../../lib/file-exists'
import { findPagesDir } from '../../lib/find-pages-dir'
import loadCustomRoutes from '../../lib/load-custom-routes'
import { verifyTypeScriptSetup } from '../../lib/verifyTypeScriptSetup'
import { verifyPartytownSetup } from '../../lib/verify-partytown-setup'
import {
  PHASE_DEVELOPMENT_SERVER,
  CLIENT_STATIC_FILES_PATH,
  DEV_CLIENT_PAGES_MANIFEST,
  DEV_MIDDLEWARE_MANIFEST,
  COMPILER_NAMES,
  PAGES_MANIFEST,
  APP_PATHS_MANIFEST,
} from '../../shared/lib/constants'
import Server, { WrappedBuildError } from '../next-server'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { absolutePathToPage } from '../../shared/lib/page-path/absolute-path-to-page'
import Router from '../router'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { eventCliSession } from '../../telemetry/events'
import { Telemetry } from '../../telemetry/storage'
import { setGlobal } from '../../trace'
import HotReloader from './hot-reloader'
import { createValidFileMatcher, findPageFile } from '../lib/find-page-file'
import { getNodeOptionsWithoutInspect } from '../lib/utils'
import {
  UnwrapPromise,
  withCoalescedInvoke,
} from '../../lib/coalesced-function'
import { loadDefaultErrorComponents } from '../load-components'
import { DecodeError, MiddlewareNotFoundError } from '../../shared/lib/utils'
import {
  createOriginalStackFrame,
  getErrorSource,
  getSourceById,
  parseStack,
} from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware'
import * as Log from '../../build/output/log'
import isError, { getProperError } from '../../lib/is-error'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { getSortedRoutes } from '../../shared/lib/router/utils'
import {
  getStaticInfoIncludingLayouts,
  runDependingOnPageType,
} from '../../build/entries'
import { NodeNextResponse, NodeNextRequest } from '../base-http/node'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import {
  getPossibleInstrumentationHookFilenames,
  getPossibleMiddlewareFilenames,
  isInstrumentationHookFile,
  isMiddlewareFile,
  NestedMiddlewareError,
} from '../../build/utils'
import { getDefineEnv } from '../../build/webpack-config'
import loadJsConfig from '../../build/load-jsconfig'
import { formatServerError } from '../../lib/format-server-error'
import { devPageFiles } from '../../build/webpack/plugins/next-types-plugin'
import {
  DevRouteMatcherManager,
  RouteEnsurer,
} from '../future/route-matcher-managers/dev-route-matcher-manager'
import { DevPagesRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-pages-route-matcher-provider'
import { DevPagesAPIRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-pages-api-route-matcher-provider'
import { DevAppPageRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-app-page-route-matcher-provider'
import { DevAppRouteRouteMatcherProvider } from '../future/route-matcher-providers/dev/dev-app-route-route-matcher-provider'
import { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import { NodeManifestLoader } from '../future/route-matcher-providers/helpers/manifest-loaders/node-manifest-loader'
import { CachedFileReader } from '../future/route-matcher-providers/dev/helpers/file-reader/cached-file-reader'
import { DefaultFileReader } from '../future/route-matcher-providers/dev/helpers/file-reader/default-file-reader'
import { NextBuildContext } from '../../build/build-context'
import { logAppDirError } from './log-app-dir-error'
import { createClientRouterFilter } from '../../lib/create-client-router-filter'
import { IncrementalCache } from '../lib/incremental-cache'
import LRUCache from 'next/dist/compiled/lru-cache'
import { NextUrlWithParsedQuery } from '../request-meta'
import { deserializeErr, errorToJSON } from '../render'
import { invokeRequest } from '../lib/server-ipc/invoke-request'
import { generateInterceptionRoutesRewrites } from '../../lib/generate-interception-routes-rewrites'

// Load ReactDevOverlay only when needed
let ReactDevOverlayImpl: FunctionComponent
const ReactDevOverlay = (props: any) => {
  if (ReactDevOverlayImpl === undefined) {
    ReactDevOverlayImpl =
      require('next/dist/compiled/@next/react-dev-overlay/dist/client').ReactDevOverlay
  }
  return ReactDevOverlayImpl(props)
}

export interface Options extends ServerOptions {
  /**
   * Tells of Next.js is running from the `next dev` command
   */
  isNextDevCommand?: boolean
}

export default class DevServer extends Server {
  private devReady: Promise<void>
  private setDevReady?: Function
  private webpackWatcher?: Watchpack | null
  private hotReloader?: HotReloader
  private isCustomServer: boolean
  protected sortedRoutes?: string[]
  private addedUpgradeListener = false
  private pagesDir?: string
  private appDir?: string
  private actualMiddlewareFile?: string
  private actualInstrumentationHookFile?: string
  private middleware?: MiddlewareRoutingItem
  private edgeFunctions?: RoutingItem[]
  private verifyingTypeScript?: boolean
  private usingTypeScript?: boolean
  private originalFetch: typeof fetch
  private staticPathsCache: LRUCache<
    string,
    UnwrapPromise<ReturnType<DevServer['getStaticPaths']>>
  >

  protected staticPathsWorker?: { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  }

  private getStaticPathsWorker(): { [key: string]: any } & {
    loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
  } {
    const worker = new Worker(require.resolve('./static-paths-worker'), {
      maxRetries: 1,
      // For dev server, it's not necessary to spin up too many workers as long as you are not doing a load test.
      // This helps reusing the memory a lot.
      numWorkers: 1,
      enableWorkerThreads: this.nextConfig.experimental.workerThreads,
      forkOptions: {
        env: {
          ...process.env,
          // discard --inspect/--inspect-brk flags from process.env.NODE_OPTIONS. Otherwise multiple Node.js debuggers
          // would be started if user launch Next.js in debugging mode. The number of debuggers is linked to
          // the number of workers Next.js tries to launch. The only worker users are interested in debugging
          // is the main Next.js one
          NODE_OPTIONS: getNodeOptionsWithoutInspect(),
        },
      },
    }) as Worker & {
      loadStaticPaths: typeof import('./static-paths-worker').loadStaticPaths
    }

    worker.getStdout().pipe(process.stdout)
    worker.getStderr().pipe(process.stderr)

    return worker
  }

  constructor(options: Options) {
    try {
      // Increase the number of stack frames on the server
      Error.stackTraceLimit = 50
    } catch {}
    super({ ...options, dev: true })
    this.originalFetch = global.fetch
    this.renderOpts.dev = true
    this.renderOpts.appDirDevErrorLogger = (err: any) =>
      this.logErrorWithOriginalStack(err, 'app-dir')
    ;(this.renderOpts as any).ErrorDebug = ReactDevOverlay
    this.devReady = new Promise((resolve) => {
      this.setDevReady = resolve
    })
    this.staticPathsCache = new LRUCache({
      // 5MB
      max: 5 * 1024 * 1024,
      length(value) {
        return JSON.stringify(value.staticPaths).length
      },
    })
    ;(this.renderOpts as any).ampSkipValidation =
      this.nextConfig.experimental?.amp?.skipValidation ?? false
    ;(this.renderOpts as any).ampValidator = (
      html: string,
      pathname: string
    ) => {
      const validatorPath =
        this.nextConfig.experimental &&
        this.nextConfig.experimental.amp &&
        this.nextConfig.experimental.amp.validator
      const AmpHtmlValidator =
        require('next/dist/compiled/amphtml-validator') as typeof import('next/dist/compiled/amphtml-validator')
      return AmpHtmlValidator.getInstance(validatorPath).then((validator) => {
        const result = validator.validateString(html)
        ampValidation(
          pathname,
          result.errors
            .filter((e) => e.severity === 'ERROR')
            .filter((e) => this._filterAmpDevelopmentScript(html, e)),
          result.errors.filter((e) => e.severity !== 'ERROR')
        )
      })
    }
    if (fs.existsSync(pathJoin(this.dir, 'static'))) {
      Log.warn(
        `The static directory has been deprecated in favor of the public directory. https://nextjs.org/docs/messages/static-dir-deprecated`
      )
    }

    // setup upgrade listener eagerly when we can otherwise
    // it will be done on the first request via req.socket.server
    if (options.httpServer) {
      this.setupWebSocketHandler(options.httpServer)
    }

    this.isCustomServer = !options.isNextDevCommand

    const { pagesDir, appDir } = findPagesDir(
      this.dir,
      !!this.nextConfig.experimental.appDir
    )
    this.pagesDir = pagesDir
    this.appDir = appDir
  }

  protected getRoutes() {
    const { pagesDir, appDir } = findPagesDir(
      this.dir,
      !!this.nextConfig.experimental.appDir
    )

    const ensurer: RouteEnsurer = {
      ensure: async (match) => {
        await this.ensurePage({
          match,
          page: match.definition.page,
          clientOnly: false,
        })
      },
    }

    const routes = super.getRoutes()
    const matchers = new DevRouteMatcherManager(
      routes.matchers,
      ensurer,
      this.dir
    )
    const handlers = routes.handlers

    const extensions = this.nextConfig.pageExtensions

    const fileReader = new CachedFileReader(new DefaultFileReader())

    // If the pages directory is available, then configure those matchers.
    if (pagesDir) {
      matchers.push(
        new DevPagesRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
      matchers.push(
        new DevPagesAPIRouteMatcherProvider(
          pagesDir,
          extensions,
          fileReader,
          this.localeNormalizer
        )
      )
    }

    if (appDir) {
      matchers.push(
        new DevAppPageRouteMatcherProvider(appDir, extensions, fileReader)
      )
      matchers.push(
        new DevAppRouteRouteMatcherProvider(appDir, extensions, fileReader)
      )
    }

    return { matchers, handlers }
  }

  protected getBuildId(): string {
    return 'development'
  }

  async addExportPathMapRoutes() {
    // Makes `next export` exportPathMap work in development mode.
    // So that the user doesn't have to define a custom server reading the exportPathMap
    if (this.nextConfig.exportPathMap) {
      Log.info('Defining routes from exportPathMap')
      const exportPathMap = await this.nextConfig.exportPathMap(
        {},
        {
          dev: true,
          dir: this.dir,
          outDir: null,
          distDir: this.distDir,
          buildId: this.buildId,
        }
      )

      // In development we can't give a default path mapping
      for (const path in exportPathMap) {
        const { page, query = {} } = exportPathMap[path]

        this.router.addFsRoute({
          match: getPathMatch(path),
          type: 'route',
          name: `${path} exportpathmap route`,
          fn: async (req, res, _params, parsedUrl) => {
            const { query: urlQuery } = parsedUrl

            Object.keys(urlQuery)
              .filter((key) => query[key] === undefined)
              .forEach((key) =>
                Log.warn(
                  `Url '${path}' defines a query parameter '${key}' that is missing in exportPathMap`
                )
              )

            const mergedQuery = { ...urlQuery, ...query }

            await this.render(req, res, page, mergedQuery, parsedUrl, true)
            return {
              finished: true,
            }
          },
        })
      }
    }
  }

  async startWatcher(): Promise<void> {
    if (this.webpackWatcher) {
      return
    }

    const validFileMatcher = createValidFileMatcher(
      this.nextConfig.pageExtensions,
      this.appDir
    )

    let resolved = false
    return new Promise(async (resolve, reject) => {
      if (this.pagesDir) {
        // Watchpack doesn't emit an event for an empty directory
        fs.readdir(this.pagesDir, (_, files) => {
          if (files?.length) {
            return
          }

          if (!resolved) {
            resolve()
            resolved = true
          }
        })
      }

      const pages = this.pagesDir ? [this.pagesDir] : []
      const app = this.appDir ? [this.appDir] : []
      const directories = [...pages, ...app]

      const rootDir = this.pagesDir || this.appDir
      const files = [
        ...getPossibleMiddlewareFilenames(
          pathJoin(rootDir!, '..'),
          this.nextConfig.pageExtensions
        ),
        ...getPossibleInstrumentationHookFilenames(
          pathJoin(rootDir!, '..'),
          this.nextConfig.pageExtensions
        ),
      ]
      let nestedMiddleware: string[] = []

      const envFiles = [
        '.env.development.local',
        '.env.local',
        '.env.development',
        '.env',
      ].map((file) => pathJoin(this.dir, file))

      files.push(...envFiles)

      // tsconfig/jsconfig paths hot-reloading
      const tsconfigPaths = [
        pathJoin(this.dir, 'tsconfig.json'),
        pathJoin(this.dir, 'jsconfig.json'),
      ]
      files.push(...tsconfigPaths)

      const wp = (this.webpackWatcher = new Watchpack({
        ignored: (pathname: string) => {
          return (
            !files.some((file) => file.startsWith(pathname)) &&
            !directories.some(
              (dir) => pathname.startsWith(dir) || dir.startsWith(pathname)
            )
          )
        },
      }))

      wp.watch({ directories: [this.dir], startTime: 0 })
      const fileWatchTimes = new Map()
      let enabledTypeScript = this.usingTypeScript
      let previousClientRouterFilters: any

      wp.on('aggregated', async () => {
        let middlewareMatchers: MiddlewareMatcher[] | undefined
        const routedPages: string[] = []
        const knownFiles = wp.getTimeInfoEntries()
        const appPaths: Record<string, string[]> = {}
        const edgeRoutesSet = new Set<string>()
        const pageNameSet = new Set<string>()
        const conflictingAppPagePaths = new Set<string>()
        const appPageFilePaths = new Map<string, string>()
        const pagesPageFilePaths = new Map<string, string>()

        let envChange = false
        let tsconfigChange = false

        devPageFiles.clear()

        for (const [fileName, meta] of knownFiles) {
          if (
            !files.includes(fileName) &&
            !directories.some((dir) => fileName.startsWith(dir))
          ) {
            continue
          }

          const watchTime = fileWatchTimes.get(fileName)
          const watchTimeChange = watchTime && watchTime !== meta?.timestamp
          fileWatchTimes.set(fileName, meta.timestamp)

          if (envFiles.includes(fileName)) {
            if (watchTimeChange) {
              envChange = true
            }
            continue
          }

          if (tsconfigPaths.includes(fileName)) {
            if (fileName.endsWith('tsconfig.json')) {
              enabledTypeScript = true
            }
            if (watchTimeChange) {
              tsconfigChange = true
            }
            continue
          }

          if (
            meta?.accuracy === undefined ||
            !validFileMatcher.isPageFile(fileName)
          ) {
            continue
          }

          const isAppPath = Boolean(
            this.appDir &&
              normalizePathSep(fileName).startsWith(
                normalizePathSep(this.appDir)
              )
          )

          devPageFiles.add(fileName)

          const rootFile = absolutePathToPage(fileName, {
            dir: this.dir,
            extensions: this.nextConfig.pageExtensions,
            keepIndex: false,
            pagesType: 'root',
          })

          const staticInfo = await getStaticInfoIncludingLayouts({
            pageFilePath: fileName,
            config: this.nextConfig,
            appDir: this.appDir,
            page: rootFile,
            isDev: true,
            isInsideAppDir: isAppPath,
            pageExtensions: this.nextConfig.pageExtensions,
          })

          if (isMiddlewareFile(rootFile)) {
            if (this.nextConfig.output === 'export') {
              Log.error(
                'Middleware cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
              )
              continue
            }
            this.actualMiddlewareFile = rootFile
            middlewareMatchers = staticInfo.middleware?.matchers || [
              { regexp: '.*', originalSource: '/:path*' },
            ]
            continue
          }
          if (
            isInstrumentationHookFile(rootFile) &&
            this.nextConfig.experimental.instrumentationHook
          ) {
            this.actualInstrumentationHookFile = rootFile
            continue
          }

          if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
            enabledTypeScript = true
          }

          let pageName = absolutePathToPage(fileName, {
            dir: isAppPath ? this.appDir! : this.pagesDir!,
            extensions: this.nextConfig.pageExtensions,
            keepIndex: isAppPath,
            pagesType: isAppPath ? 'app' : 'pages',
          })

          if (
            !isAppPath &&
            pageName.startsWith('/api/') &&
            this.nextConfig.output === 'export'
          ) {
            Log.error(
              'API Routes cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
            continue
          }

          if (isAppPath) {
            if (
              !validFileMatcher.isAppRouterPage(fileName) &&
              !validFileMatcher.isRootNotFound(fileName)
            ) {
              continue
            }
            // Ignore files/directories starting with `_` in the app directory
            if (normalizePathSep(pageName).includes('/_')) {
              continue
            }

            const originalPageName = pageName
            pageName = normalizeAppPath(pageName).replace(/%5F/g, '_')
            if (!appPaths[pageName]) {
              appPaths[pageName] = []
            }
            appPaths[pageName].push(originalPageName)

            if (routedPages.includes(pageName)) {
              continue
            }
          } else {
            // /index is preserved for root folder
            pageName = pageName.replace(/\/index$/, '') || '/'
          }

          ;(isAppPath ? appPageFilePaths : pagesPageFilePaths).set(
            pageName,
            fileName
          )

          if (this.appDir && pageNameSet.has(pageName)) {
            conflictingAppPagePaths.add(pageName)
          } else {
            pageNameSet.add(pageName)
          }

          /**
           * If there is a middleware that is not declared in the root we will
           * warn without adding it so it doesn't make its way into the system.
           */
          if (/[\\\\/]_middleware$/.test(pageName)) {
            nestedMiddleware.push(pageName)
            continue
          }

          await runDependingOnPageType({
            page: pageName,
            pageRuntime: staticInfo.runtime,
            onClient: () => {},
            onServer: () => {
              routedPages.push(pageName)
            },
            onEdgeServer: () => {
              routedPages.push(pageName)
              edgeRoutesSet.add(pageName)
            },
          })
        }

        const numConflicting = conflictingAppPagePaths.size
        if (numConflicting > 0) {
          Log.error(
            `Conflicting app and page file${
              numConflicting === 1 ? ' was' : 's were'
            } found, please remove the conflicting files to continue:`
          )
          for (const p of conflictingAppPagePaths) {
            const appPath = relative(this.dir, appPageFilePaths.get(p)!)
            const pagesPath = relative(this.dir, pagesPageFilePaths.get(p)!)
            Log.error(`  "${pagesPath}" - "${appPath}"`)
          }
        }
        let clientRouterFilters: any

        if (this.nextConfig.experimental.clientRouterFilter) {
          clientRouterFilters = createClientRouterFilter(
            Object.keys(appPaths),
            this.nextConfig.experimental.clientRouterFilterRedirects
              ? ((this.nextConfig as any)._originalRedirects || []).filter(
                  (r: any) => !r.internal
                )
              : [],
            this.nextConfig.experimental.clientRouterFilterAllowedRate
          )

          if (
            !previousClientRouterFilters ||
            JSON.stringify(previousClientRouterFilters) !==
              JSON.stringify(clientRouterFilters)
          ) {
            envChange = true
            previousClientRouterFilters = clientRouterFilters
          }
        }

        if (!this.usingTypeScript && enabledTypeScript) {
          // we tolerate the error here as this is best effort
          // and the manual install command will be shown
          await this.verifyTypeScript()
            .then(() => {
              tsconfigChange = true
            })
            .catch(() => {})
        }

        if (envChange || tsconfigChange) {
          if (envChange) {
            this.loadEnvConfig({
              dev: true,
              forceReload: true,
              silent: !!process.env.__NEXT_PRIVATE_RENDER_WORKER,
            })
          }
          let tsconfigResult:
            | UnwrapPromise<ReturnType<typeof loadJsConfig>>
            | undefined

          if (tsconfigChange) {
            try {
              tsconfigResult = await loadJsConfig(this.dir, this.nextConfig)
            } catch (_) {
              /* do we want to log if there are syntax errors in tsconfig  while editing? */
            }
          }

          this.hotReloader?.activeConfigs?.forEach((config, idx) => {
            const isClient = idx === 0
            const isNodeServer = idx === 1
            const isEdgeServer = idx === 2
            const hasRewrites =
              this.customRoutes.rewrites.afterFiles.length > 0 ||
              this.customRoutes.rewrites.beforeFiles.length > 0 ||
              this.customRoutes.rewrites.fallback.length > 0

            if (tsconfigChange) {
              config.resolve?.plugins?.forEach((plugin: any) => {
                // look for the JsConfigPathsPlugin and update with
                // the latest paths/baseUrl config
                if (plugin && plugin.jsConfigPlugin && tsconfigResult) {
                  const { resolvedBaseUrl, jsConfig } = tsconfigResult
                  const currentResolvedBaseUrl = plugin.resolvedBaseUrl
                  const resolvedUrlIndex = config.resolve?.modules?.findIndex(
                    (item) => item === currentResolvedBaseUrl
                  )

                  if (
                    resolvedBaseUrl &&
                    resolvedBaseUrl !== currentResolvedBaseUrl
                  ) {
                    // remove old baseUrl and add new one
                    if (resolvedUrlIndex && resolvedUrlIndex > -1) {
                      config.resolve?.modules?.splice(resolvedUrlIndex, 1)
                    }
                    config.resolve?.modules?.push(resolvedBaseUrl)
                  }

                  if (jsConfig?.compilerOptions?.paths && resolvedBaseUrl) {
                    Object.keys(plugin.paths).forEach((key) => {
                      delete plugin.paths[key]
                    })
                    Object.assign(plugin.paths, jsConfig.compilerOptions.paths)
                    plugin.resolvedBaseUrl = resolvedBaseUrl
                  }
                }
              })
            }

            if (envChange) {
              config.plugins?.forEach((plugin: any) => {
                // we look for the DefinePlugin definitions so we can
                // update them on the active compilers
                if (
                  plugin &&
                  typeof plugin.definitions === 'object' &&
                  plugin.definitions.__NEXT_DEFINE_ENV
                ) {
                  const newDefine = getDefineEnv({
                    dev: true,
                    config: this.nextConfig,
                    distDir: this.distDir,
                    isClient,
                    hasRewrites,
                    isNodeServer,
                    isEdgeServer,
                    clientRouterFilters,
                  })

                  Object.keys(plugin.definitions).forEach((key) => {
                    if (!(key in newDefine)) {
                      delete plugin.definitions[key]
                    }
                  })
                  Object.assign(plugin.definitions, newDefine)
                }
              })
            }
          })
          this.hotReloader?.invalidate()
        }

        if (nestedMiddleware.length > 0) {
          Log.error(
            new NestedMiddlewareError(
              nestedMiddleware,
              this.dir,
              (this.pagesDir || this.appDir)!
            ).message
          )
          nestedMiddleware = []
        }

        // Make sure to sort parallel routes to make the result deterministic.
        this.appPathRoutes = Object.fromEntries(
          Object.entries(appPaths).map(([k, v]) => [k, v.sort()])
        )
        const edgeRoutes = Array.from(edgeRoutesSet)
        this.edgeFunctions = getSortedRoutes(edgeRoutes).map((page) => {
          const matchedAppPaths = this.getOriginalAppPaths(page)
          if (Array.isArray(matchedAppPaths)) {
            page = matchedAppPaths[0]
          }
          const edgeRegex = getRouteRegex(page)
          return {
            match: getRouteMatcher(edgeRegex),
            page,
            re: edgeRegex.re,
          }
        })

        this.middleware = middlewareMatchers
          ? {
              match: getMiddlewareRouteMatcher(middlewareMatchers),
              page: '/',
              matchers: middlewareMatchers,
            }
          : undefined

        this.customRoutes = await loadCustomRoutes(this.nextConfig)
        const { rewrites } = this.customRoutes

        this.customRoutes.rewrites.beforeFiles.push(
          ...generateInterceptionRoutesRewrites(Object.keys(appPaths))
        )

        if (
          rewrites.beforeFiles.length ||
          rewrites.afterFiles.length ||
          rewrites.fallback.length
        ) {
          this.router.setRewrites(
            this.generateRewrites({
              restrictedRedirectPaths: [],
            })
          )
        }

        try {
          // we serve a separate manifest with all pages for the client in
          // dev mode so that we can match a page after a rewrite on the client
          // before it has been built and is populated in the _buildManifest
          const sortedRoutes = getSortedRoutes(routedPages)

          this.dynamicRoutes = sortedRoutes
            .map((page) => {
              const regex = getRouteRegex(page)
              return {
                match: getRouteMatcher(regex),
                page,
                re: regex.re,
              }
            })
            .filter(Boolean) as any

          if (
            !this.sortedRoutes?.every((val, idx) => val === sortedRoutes[idx])
          ) {
            // emit the change so clients fetch the update
            this.hotReloader?.send(undefined, { devPagesManifest: true })
          }
          this.sortedRoutes = sortedRoutes

          this.router.setCatchallMiddleware(
            this.generateCatchAllMiddlewareRoute(true)
          )

          if (!resolved) {
            resolve()
            resolved = true
          }
        } catch (e) {
          if (!resolved) {
            reject(e)
            resolved = true
          } else {
            Log.warn('Failed to reload dynamic routes:', e)
          }
        } finally {
          // Reload the matchers. The filesystem would have been written to,
          // and the matchers need to re-scan it to update the router.
          await this.matchers.reload()
        }
      })
    })
  }

  async stopWatcher(): Promise<void> {
    if (!this.webpackWatcher) {
      return
    }

    this.webpackWatcher.close()
    this.webpackWatcher = null
  }

  private async verifyTypeScript() {
    if (this.verifyingTypeScript) {
      return
    }
    try {
      this.verifyingTypeScript = true
      const verifyResult = await verifyTypeScriptSetup({
        dir: this.dir,
        distDir: this.nextConfig.distDir,
        intentDirs: [this.pagesDir, this.appDir].filter(Boolean) as string[],
        typeCheckPreflight: false,
        tsconfigPath: this.nextConfig.typescript.tsconfigPath,
        disableStaticImages: this.nextConfig.images.disableStaticImages,
        hasAppDir: !!this.appDir,
        hasPagesDir: !!this.pagesDir,
      })

      if (verifyResult.version) {
        this.usingTypeScript = true
      }
    } finally {
      this.verifyingTypeScript = false
    }
  }

  protected async prepareImpl(): Promise<void> {
    setGlobal('distDir', this.distDir)
    setGlobal('phase', PHASE_DEVELOPMENT_SERVER)

    await this.verifyTypeScript()
    this.customRoutes = await loadCustomRoutes(this.nextConfig)

    // reload router
    const { redirects, rewrites, headers } = this.customRoutes

    if (
      rewrites.beforeFiles.length ||
      rewrites.afterFiles.length ||
      rewrites.fallback.length ||
      redirects.length ||
      headers.length
    ) {
      this.router = new Router(this.generateRoutes(true))
    }
    const telemetry = new Telemetry({ distDir: this.distDir })

    // router worker does not start webpack compilers
    if (!this.isRenderWorker) {
      this.hotReloader = new HotReloader(this.dir, {
        pagesDir: this.pagesDir,
        distDir: this.distDir,
        config: this.nextConfig,
        previewProps: this.getPrerenderManifest().preview,
        buildId: this.buildId,
        rewrites,
        appDir: this.appDir,
        telemetry,
      })
    }
    await super.prepareImpl()
    await this.addExportPathMapRoutes()
    await this.hotReloader?.start()
    await this.startWatcher()
    await this.runInstrumentationHookIfAvailable()
    await this.matchers.reload()
    this.setDevReady!()

    if (this.nextConfig.experimental.nextScriptWorkers) {
      await verifyPartytownSetup(
        this.dir,
        pathJoin(this.distDir, CLIENT_STATIC_FILES_PATH)
      )
    }

    // This is required by the tracing subsystem.
    setGlobal('appDir', this.appDir)
    setGlobal('pagesDir', this.pagesDir)
    setGlobal('telemetry', telemetry)

    const isSrcDir = relative(
      this.dir,
      this.pagesDir || this.appDir || ''
    ).startsWith('src')

    if (!this.isRenderWorker) {
      telemetry.record(
        eventCliSession(this.distDir, this.nextConfig, {
          webpackVersion: 5,
          cliCommand: 'dev',
          isSrcDir,
          hasNowJson: !!(await findUp('now.json', { cwd: this.dir })),
          isCustomServer: this.isCustomServer,
          turboFlag: false,
          pagesDir: !!this.pagesDir,
          appDir: !!this.appDir,
        })
      )
    }

    process.on('unhandledRejection', (reason) => {
      this.logErrorWithOriginalStack(reason, 'unhandledRejection').catch(
        () => {}
      )
    })
    process.on('uncaughtException', (err) => {
      this.logErrorWithOriginalStack(err, 'uncaughtException').catch(() => {})
    })
  }

  protected async close(): Promise<void> {
    await this.stopWatcher()
    if (this.hotReloader) {
      await this.hotReloader.stop()
    }
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    let normalizedPath: string
    try {
      normalizedPath = normalizePagePath(pathname)
    } catch (err) {
      console.error(err)
      // if normalizing the page fails it means it isn't valid
      // so it doesn't exist so don't throw and return false
      // to ensure we return 404 instead of 500
      return false
    }

    if (isMiddlewareFile(normalizedPath)) {
      return findPageFile(
        this.dir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      ).then(Boolean)
    }

    let appFile: string | null = null
    let pagesFile: string | null = null

    if (this.appDir) {
      appFile = await findPageFile(
        this.appDir,
        normalizedPath + '/page',
        this.nextConfig.pageExtensions,
        true
      )
    }

    if (this.pagesDir) {
      pagesFile = await findPageFile(
        this.pagesDir,
        normalizedPath,
        this.nextConfig.pageExtensions,
        false
      )
    }
    if (appFile && pagesFile) {
      throw new Error(
        `Conflicting app and page file found: "app${appFile}" and "pages${pagesFile}". Please remove one to continue.`
      )
    }

    return Boolean(appFile || pagesFile)
  }

  protected async _beforeCatchAllRender(
    req: BaseNextRequest,
    res: BaseNextResponse,
    params: Params,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    const { pathname } = parsedUrl
    const pathParts = params.path || []
    const path = `/${pathParts.join('/')}`
    // check for a public file, throwing error if there's a
    // conflicting page
    let decodedPath: string

    try {
      decodedPath = decodeURIComponent(path)
    } catch (_) {
      throw new DecodeError('failed to decode param')
    }

    if (await this.hasPublicFile(decodedPath)) {
      const match = await this.matchers.match(pathname!, { skipDynamic: true })
      if (match) {
        const err = new Error(
          `A conflicting public file and page file was found for path ${pathname} https://nextjs.org/docs/messages/conflicting-public-file-page`
        )
        res.statusCode = 500
        await this.renderError(err, req, res, pathname!, {})
        return true
      }
      await this.servePublic(req, res, pathParts)
      return true
    }

    return false
  }

  private setupWebSocketHandler(server?: HTTPServer, _req?: NodeNextRequest) {
    if (!this.addedUpgradeListener) {
      this.addedUpgradeListener = true
      server = server || (_req?.originalRequest.socket as any)?.server

      if (!server) {
        // this is very unlikely to happen but show an error in case
        // it does somehow
        Log.error(
          `Invalid IncomingMessage received, make sure http.createServer is being used to handle requests.`
        )
      } else {
        const { basePath } = this.nextConfig

        server.on('upgrade', async (req, socket, head) => {
          let assetPrefix = (this.nextConfig.assetPrefix || '').replace(
            /^\/+/,
            ''
          )

          // assetPrefix can be a proxy server with a url locally
          // if so, it's needed to send these HMR requests with a rewritten url directly to /_next/webpack-hmr
          // otherwise account for a path-like prefix when listening to socket events
          if (assetPrefix.startsWith('http')) {
            assetPrefix = ''
          } else if (assetPrefix) {
            assetPrefix = `/${assetPrefix}`
          }

          if (
            req.url?.startsWith(
              `${basePath || assetPrefix || ''}/_next/webpack-hmr`
            )
          ) {
            if (!this.isRenderWorker) {
              this.hotReloader?.onHMR(req, socket, head)
            }
          } else {
            this.handleUpgrade(req, socket, head)
          }
        })
      }
    }
  }

  async runMiddleware(params: {
    request: BaseNextRequest
    response: BaseNextResponse
    parsedUrl: ParsedUrl
    parsed: UrlWithParsedQuery
    middlewareList: MiddlewareRoutingItem[]
  }) {
    try {
      const result = await super.runMiddleware({
        ...params,
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning')
        },
      })

      if ('finished' in result) {
        return result
      }

      result.waitUntil.catch((error) => {
        this.logErrorWithOriginalStack(error, 'unhandledRejection')
      })
      return result
    } catch (error) {
      if (error instanceof DecodeError) {
        throw error
      }

      /**
       * We only log the error when it is not a MiddlewareNotFound error as
       * in that case we should be already displaying a compilation error
       * which is what makes the module not found.
       */
      if (!(error instanceof MiddlewareNotFoundError)) {
        this.logErrorWithOriginalStack(error)
      }

      const err = getProperError(error)
      ;(err as any).middleware = true
      const { request, response, parsedUrl } = params

      /**
       * When there is a failure for an internal Next.js request from
       * middleware we bypass the error without finishing the request
       * so we can serve the required chunks to render the error.
       */
      if (
        request.url.includes('/_next/static') ||
        request.url.includes('/__nextjs_original-stack-frame')
      ) {
        return { finished: false }
      }

      response.statusCode = 500
      this.renderError(err, request, response, parsedUrl.pathname)
      return { finished: true }
    }
  }

  async runEdgeFunction(params: {
    req: BaseNextRequest
    res: BaseNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
    appPaths: string[] | null
    isAppPath: boolean
  }) {
    try {
      return super.runEdgeFunction({
        ...params,
        onWarning: (warn) => {
          this.logErrorWithOriginalStack(warn, 'warning')
        },
      })
    } catch (error) {
      if (error instanceof DecodeError) {
        throw error
      }
      this.logErrorWithOriginalStack(error, 'warning')
      const err = getProperError(error)
      const { req, res, page } = params
      res.statusCode = 500
      this.renderError(err, req, res, page)
      return null
    }
  }

  public async handleRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    await this.devReady
    return await super.handleRequest(req, res, parsedUrl)
  }

  async run(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<void> {
    await this.devReady
    this.setupWebSocketHandler(undefined, req)

    const { basePath } = this.nextConfig
    let originalPathname: string | null = null

    // TODO: see if we can remove this in the future
    if (basePath && pathHasPrefix(parsedUrl.pathname || '/', basePath)) {
      // strip basePath before handling dev bundles
      // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
      originalPathname = parsedUrl.pathname
      parsedUrl.pathname = removePathPrefix(parsedUrl.pathname || '/', basePath)
    }

    const { pathname } = parsedUrl

    if (pathname!.startsWith('/_next')) {
      if (await fileExists(pathJoin(this.publicDir, '_next'))) {
        throw new Error(PUBLIC_DIR_MIDDLEWARE_CONFLICT)
      }
    }

    if (this.hotReloader) {
      const { finished = false } = await this.hotReloader.run(
        req.originalRequest,
        res.originalResponse,
        parsedUrl
      )

      if (finished) return
    }

    if (originalPathname) {
      // restore the path before continuing so that custom-routes can accurately determine
      // if they should match against the basePath or not
      parsedUrl.pathname = originalPathname
    }
    try {
      return await super.run(req, res, parsedUrl)
    } catch (error) {
      const err = getProperError(error)
      formatServerError(err)
      this.logErrorWithOriginalStack(err).catch(() => {})
      if (!res.sent) {
        res.statusCode = 500
        try {
          return await this.renderError(err, req, res, pathname!, {
            __NEXT_PAGE: (isError(err) && err.page) || pathname || '',
          })
        } catch (internalErr) {
          console.error(internalErr)
          res.body('Internal Server Error').send()
        }
      }
    }
  }

  private async invokeIpcMethod(method: string, args: any[]): Promise<any> {
    const ipcPort = process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT
    const ipcKey = process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY
    if (ipcPort) {
      const res = await invokeRequest(
        `http://${this.hostname}:${ipcPort}?key=${ipcKey}&method=${
          method as string
        }&args=${encodeURIComponent(JSON.stringify(args))}`,
        {
          method: 'GET',
          headers: {},
        }
      )
      const chunks = []

      for await (const chunk of res) {
        if (chunk) {
          chunks.push(chunk)
        }
      }
      const body = Buffer.concat(chunks).toString()

      if (body.startsWith('{') && body.endsWith('}')) {
        const parsedBody = JSON.parse(body)

        if (
          parsedBody &&
          typeof parsedBody === 'object' &&
          'err' in parsedBody &&
          'stack' in parsedBody.err
        ) {
          throw deserializeErr(parsedBody.err)
        }
        return parsedBody
      }
    }
  }

  protected async logErrorWithOriginalStack(
    err?: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ) {
    if (this.isRenderWorker) {
      await this.invokeIpcMethod('logErrorWithOriginalStack', [
        errorToJSON(err as Error),
        type,
      ])
      return
    }

    let usedOriginalStack = false

    if (isError(err) && err.stack) {
      try {
        const frames = parseStack(err.stack!)
        const frame = frames.find(
          ({ file }) =>
            !file?.startsWith('eval') &&
            !file?.includes('web/adapter') &&
            !file?.includes('sandbox/context') &&
            !file?.includes('<anonymous>')
        )

        if (frame?.lineNumber && frame?.file) {
          const moduleId = frame.file!.replace(
            /^(webpack-internal:\/\/\/|file:\/\/)/,
            ''
          )
          const modulePath = frame.file.replace(
            /^(webpack-internal:\/\/\/|file:\/\/)(\(.*\)\/)?/,
            ''
          )

          const src = getErrorSource(err as Error)
          const isEdgeCompiler = src === COMPILER_NAMES.edgeServer
          const compilation = (
            isEdgeCompiler
              ? this.hotReloader?.edgeServerStats?.compilation
              : this.hotReloader?.serverStats?.compilation
          )!

          const source = await getSourceById(
            !!frame.file?.startsWith(sep) || !!frame.file?.startsWith('file:'),
            moduleId,
            compilation
          )

          const originalFrame = await createOriginalStackFrame({
            line: frame.lineNumber,
            column: frame.column,
            source,
            frame,
            moduleId,
            modulePath,
            rootDirectory: this.dir,
            errorMessage: err.message,
            serverCompilation: isEdgeCompiler
              ? undefined
              : this.hotReloader?.serverStats?.compilation,
            edgeCompilation: isEdgeCompiler
              ? this.hotReloader?.edgeServerStats?.compilation
              : undefined,
          }).catch(() => {})

          if (originalFrame) {
            const { originalCodeFrame, originalStackFrame } = originalFrame
            const { file, lineNumber, column, methodName } = originalStackFrame

            Log[type === 'warning' ? 'warn' : 'error'](
              `${file} (${lineNumber}:${column}) @ ${methodName}`
            )
            if (isEdgeCompiler) {
              err = err.message
            }
            if (type === 'warning') {
              Log.warn(err)
            } else if (type === 'app-dir') {
              logAppDirError(err)
            } else if (type) {
              Log.error(`${type}:`, err)
            } else {
              Log.error(err)
            }
            console[type === 'warning' ? 'warn' : 'error'](originalCodeFrame)
            usedOriginalStack = true
          }
        }
      } catch (_) {
        // failed to load original stack using source maps
        // this un-actionable by users so we don't show the
        // internal error and only show the provided stack
      }
    }

    if (!usedOriginalStack) {
      if (type === 'warning') {
        Log.warn(err)
      } else if (type === 'app-dir') {
        logAppDirError(err)
      } else if (type) {
        Log.error(`${type}:`, err)
      } else {
        Log.error(err)
      }
    }
  }

  // override production loading of routes-manifest
  protected getCustomRoutes(): CustomRoutes {
    // actual routes will be loaded asynchronously during .prepare()
    return {
      redirects: [],
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
      headers: [],
    }
  }

  protected getPagesManifest(): PagesManifest | undefined {
    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, PAGES_MANIFEST)
      ) ?? undefined
    )
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.hasAppDir) return undefined

    return (
      NodeManifestLoader.require(
        pathJoin(this.serverDistDir, APP_PATHS_MANIFEST)
      ) ?? undefined
    )
  }

  protected getMiddleware() {
    return this.middleware
  }

  protected getEdgeFunctionsPages() {
    return this.edgeFunctions ? this.edgeFunctions.map(({ page }) => page) : []
  }

  protected getServerComponentManifest() {
    return undefined
  }

  protected getServerCSSManifest() {
    return undefined
  }

  protected getNextFontManifest() {
    return undefined
  }

  protected async hasMiddleware(): Promise<boolean> {
    return this.hasPage(this.actualMiddlewareFile!)
  }

  protected async ensureMiddleware() {
    return this.ensurePage({
      page: this.actualMiddlewareFile!,
      clientOnly: false,
    })
  }

  private async runInstrumentationHookIfAvailable() {
    if (this.actualInstrumentationHookFile) {
      NextBuildContext!.hasInstrumentationHook = true
      await this.ensurePage({
        page: this.actualInstrumentationHookFile!,
        clientOnly: false,
      })
      try {
        const instrumentationHook = await require(pathJoin(
          this.distDir,
          'server',
          INSTRUMENTATION_HOOK_FILENAME
        ))
        await instrumentationHook.register()
      } catch (err: any) {
        err.message = `An error occurred while loading instrumentation hook: ${err.message}`
        throw err
      }
    }
  }

  protected async ensureEdgeFunction({
    page,
    appPaths,
  }: {
    page: string
    appPaths: string[] | null
  }) {
    return this.ensurePage({ page, appPaths, clientOnly: false })
  }

  generateRoutes(dev?: boolean) {
    const { fsRoutes, ...otherRoutes } = super.generateRoutes(dev)

    // Create a shallow copy so we can mutate it.
    const routes = [...fsRoutes]

    // In development we expose all compiled files for react-error-overlay's line show feature
    // We use unshift so that we're sure the routes is defined before Next's default routes
    routes.unshift({
      match: getPathMatch('/_next/development/:path*'),
      type: 'route',
      name: '_next/development catchall',
      fn: async (req, res, params) => {
        const p = pathJoin(this.distDir, ...(params.path || []))
        await this.serveStatic(req, res, p)
        return {
          finished: true,
        }
      },
    })

    routes.unshift({
      match: getPathMatch(
        `/_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_CLIENT_PAGES_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_CLIENT_PAGES_MANIFEST}`,
      fn: async (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res
          .body(
            JSON.stringify({
              pages: this.sortedRoutes?.filter(
                (route) => !this.appPathRoutes![route]
              ),
            })
          )
          .send()
        return {
          finished: true,
        }
      },
    })

    routes.unshift({
      match: getPathMatch(
        `/_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_MIDDLEWARE_MANIFEST}`
      ),
      type: 'route',
      name: `_next/${CLIENT_STATIC_FILES_PATH}/${this.buildId}/${DEV_MIDDLEWARE_MANIFEST}`,
      fn: async (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.body(JSON.stringify(this.getMiddleware()?.matchers ?? [])).send()
        return {
          finished: true,
        }
      },
    })

    routes.push({
      match: getPathMatch('/:path*'),
      type: 'route',
      name: 'catchall public directory route',
      fn: async (req, res, params, parsedUrl) => {
        const { pathname } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // Used in development to check public directory paths
        if (await this._beforeCatchAllRender(req, res, params, parsedUrl)) {
          return {
            finished: true,
          }
        }

        return {
          finished: false,
        }
      },
    })

    return { fsRoutes: routes, ...otherRoutes }
  }

  // In development public files are not added to the router but handled as a fallback instead
  protected generatePublicRoutes(): never[] {
    return []
  }

  _filterAmpDevelopmentScript(
    html: string,
    event: { line: number; col: number; code: string }
  ): boolean {
    if (event.code !== 'DISALLOWED_SCRIPT_TAG') {
      return true
    }

    const snippetChunks = html.split('\n')

    let snippet
    if (
      !(snippet = html.split('\n')[event.line - 1]) ||
      !(snippet = snippet.substring(event.col))
    ) {
      return true
    }

    snippet = snippet + snippetChunks.slice(event.line).join('\n')
    snippet = snippet.substring(0, snippet.indexOf('</script>'))

    return !snippet.includes('data-amp-development-mode-only')
  }

  protected async getStaticPaths({
    pathname,
    originalAppPath,
    requestHeaders,
  }: {
    pathname: string
    originalAppPath?: string
    requestHeaders: IncrementalCache['requestHeaders']
  }): Promise<{
    staticPaths?: string[]
    fallbackMode?: false | 'static' | 'blocking'
  }> {
    const isAppPath = Boolean(originalAppPath)
    // we lazy load the staticPaths to prevent the user
    // from waiting on them for the page to load in dev mode

    const __getStaticPaths = async () => {
      const {
        configFileName,
        publicRuntimeConfig,
        serverRuntimeConfig,
        httpAgentOptions,
      } = this.nextConfig
      const { locales, defaultLocale } = this.nextConfig.i18n || {}
      const staticPathsWorker = this.getStaticPathsWorker()

      try {
        const pathsResult = await staticPathsWorker.loadStaticPaths({
          distDir: this.distDir,
          pathname,
          config: {
            configFileName,
            publicRuntimeConfig,
            serverRuntimeConfig,
          },
          httpAgentOptions,
          locales,
          defaultLocale,
          originalAppPath,
          isAppPath,
          requestHeaders,
          incrementalCacheHandlerPath:
            this.nextConfig.experimental.incrementalCacheHandlerPath,
          fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
          isrFlushToDisk: this.nextConfig.experimental.isrFlushToDisk,
          maxMemoryCacheSize: this.nextConfig.experimental.isrMemoryCacheSize,
        })
        return pathsResult
      } finally {
        // we don't re-use workers so destroy the used one
        staticPathsWorker.end()
      }
    }
    const result = this.staticPathsCache.get(pathname)

    const nextInvoke = withCoalescedInvoke(__getStaticPaths)(
      `staticPaths-${pathname}`,
      []
    )
      .then((res) => {
        const { paths: staticPaths = [], fallback } = res.value
        if (!isAppPath && this.nextConfig.output === 'export') {
          if (fallback === 'blocking') {
            throw new Error(
              'getStaticPaths with "fallback: blocking" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          } else if (fallback === true) {
            throw new Error(
              'getStaticPaths with "fallback: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/advanced-features/static-html-export'
            )
          }
        }
        const value: {
          staticPaths: string[]
          fallbackMode: 'blocking' | 'static' | false | undefined
        } = {
          staticPaths,
          fallbackMode:
            fallback === 'blocking'
              ? 'blocking'
              : fallback === true
              ? 'static'
              : fallback,
        }
        this.staticPathsCache.set(pathname, value)
        return value
      })
      .catch((err) => {
        this.staticPathsCache.del(pathname)
        if (!result) throw err
        Log.error(`Failed to generate static paths for ${pathname}:`)
        console.error(err)
      })

    if (result) {
      return result
    }
    return nextInvoke as NonNullable<typeof result>
  }

  private restorePatchedGlobals(): void {
    global.fetch = this.originalFetch
  }

  protected async ensurePage(opts: {
    page: string
    clientOnly: boolean
    appPaths?: string[] | null
    match?: RouteMatch
  }) {
    if (this.isRenderWorker) {
      await this.invokeIpcMethod('ensurePage', [opts])
      return
    }
    return this.hotReloader?.ensurePage(opts)
  }

  protected async findPageComponents({
    pathname,
    query,
    params,
    isAppPath,
    appPaths = null,
    shouldEnsure,
  }: {
    pathname: string
    query: ParsedUrlQuery
    params: Params
    isAppPath: boolean
    appPaths?: string[] | null
    shouldEnsure: boolean
  }): Promise<FindComponentsResult | null> {
    await this.devReady
    const compilationErr = await this.getCompilationError(pathname)
    if (compilationErr) {
      // Wrap build errors so that they don't get logged again
      throw new WrappedBuildError(compilationErr)
    }
    try {
      if (shouldEnsure || this.renderOpts.customServer) {
        await this.ensurePage({
          page: pathname,
          appPaths,
          clientOnly: false,
        })
      }

      // When the new page is compiled, we need to reload the server component
      // manifest.
      if (!!this.appDir) {
        this.clientReferenceManifest = super.getServerComponentManifest()
        this.serverCSSManifest = super.getServerCSSManifest()
      }
      this.nextFontManifest = super.getNextFontManifest()
      // before we re-evaluate a route module, we want to restore globals that might
      // have been patched previously to their original state so that we don't
      // patch on top of the previous patch, which would keep the context of the previous
      // patched global in memory, creating a memory leak.
      this.restorePatchedGlobals()

      return await super.findPageComponents({
        pathname,
        query,
        params,
        isAppPath,
      })
    } catch (err) {
      if ((err as any).code !== 'ENOENT') {
        throw err
      }
      return null
    }
  }

  protected async getFallbackErrorComponents(): Promise<LoadComponentsReturnType | null> {
    if (this.isRenderWorker) {
      await this.invokeIpcMethod('getFallbackErrorComponents', [])
      return await loadDefaultErrorComponents(this.distDir)
    }
    await this.hotReloader?.buildFallbackError()
    // Build the error page to ensure the fallback is built too.
    // TODO: See if this can be moved into hotReloader or removed.
    await this.ensurePage({ page: '/_error', clientOnly: false })

    if (this.isRouterWorker) {
      return null
    }
    return await loadDefaultErrorComponents(this.distDir)
  }

  protected setImmutableAssetCacheControl(res: BaseNextResponse): void {
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }

  private servePublic(
    req: BaseNextRequest,
    res: BaseNextResponse,
    pathParts: string[]
  ): Promise<void> {
    const p = pathJoin(this.publicDir, ...pathParts)
    return this.serveStatic(req, res, p)
  }

  async hasPublicFile(path: string): Promise<boolean> {
    try {
      const info = await fs.promises.stat(pathJoin(this.publicDir, path))
      return info.isFile()
    } catch (_) {
      return false
    }
  }

  async getCompilationError(page: string): Promise<any> {
    if (this.isRenderWorker) {
      const err = await this.invokeIpcMethod('getCompilationError', [page])
      return deserializeErr(err)
    }
    const errors = await this.hotReloader?.getCompilationErrors(page)
    if (!errors) return

    // Return the very first error we found.
    return errors[0]
  }

  protected isServableUrl(untrustedFileUrl: string): boolean {
    // This method mimics what the version of `send` we use does:
    // 1. decodeURIComponent:
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L989
    //    https://github.com/pillarjs/send/blob/0.17.1/index.js#L518-L522
    // 2. resolve:
    //    https://github.com/pillarjs/send/blob/de073ed3237ade9ff71c61673a34474b30e5d45b/index.js#L561

    let decodedUntrustedFilePath: string
    try {
      // (1) Decode the URL so we have the proper file name
      decodedUntrustedFilePath = decodeURIComponent(untrustedFileUrl)
    } catch {
      return false
    }

    // (2) Resolve "up paths" to determine real request
    const untrustedFilePath = pathResolve(decodedUntrustedFilePath)

    // don't allow null bytes anywhere in the file path
    if (untrustedFilePath.indexOf('\0') !== -1) {
      return false
    }

    // During development mode, files can be added while the server is running.
    // Checks for .next/static, .next/server, static and public.
    // Note that in development .next/server is available for error reporting purposes.
    // see `packages/next/server/next-server.ts` for more details.
    if (
      untrustedFilePath.startsWith(pathJoin(this.distDir, 'static') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.distDir, 'server') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.dir, 'static') + sep) ||
      untrustedFilePath.startsWith(pathJoin(this.dir, 'public') + sep)
    ) {
      return true
    }

    return false
  }
}
