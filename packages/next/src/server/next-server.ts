import './node-environment'
import './require-hook'
import './node-polyfill-fetch'
import './node-polyfill-form'
import './node-polyfill-web-streams'
import './node-polyfill-crypto'

import type { TLSSocket } from 'tls'
import type { Route, RouterOptions } from './router'
import {
  CacheFs,
  DecodeError,
  PageNotFoundError,
  MiddlewareNotFoundError,
} from '../shared/lib/utils'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type RenderResult from './render-result'
import type { FetchEventResult } from './web/types'
import type { PrerenderManifest } from '../build'
import type { CustomRoutes, Rewrite } from '../lib/load-custom-routes'
import { BaseNextRequest, BaseNextResponse } from './base-http'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { PayloadOptions } from './send-payload'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import {
  getRouteMatcher,
  Params,
} from '../shared/lib/router/utils/route-matcher'
import type { MiddlewareRouteMatch } from '../shared/lib/router/utils/middleware-route-matcher'
import type { RouteMatch } from './future/route-matches/route-match'

import fs from 'fs'
import { join, relative, resolve, sep, isAbsolute } from 'path'
import { IncomingMessage, ServerResponse } from 'http'
import { addRequestMeta, getRequestMeta } from './request-meta'
import {
  PAGES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  CLIENT_STATIC_FILES_RUNTIME,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  CLIENT_PUBLIC_FILES_PATH,
  APP_PATHS_MANIFEST,
  FLIGHT_SERVER_CSS_MANIFEST,
  SERVER_DIRECTORY,
  NEXT_FONT_MANIFEST,
  PHASE_PRODUCTION_BUILD,
} from '../shared/lib/constants'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import { findDir } from '../lib/find-pages-dir'
import { format as formatUrl, UrlWithParsedQuery } from 'url'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { createHeaderRoute, createRedirectRoute } from './server-route-utils'
import getRouteFromAssetPath from '../shared/lib/router/utils/get-route-from-asset-path'
import { NodeNextRequest, NodeNextResponse } from './base-http/node'
import { sendRenderResult } from './send-payload'
import { getExtension, serveStatic } from './serve-static'
import { ParsedUrlQuery } from 'querystring'
import { apiResolver } from './api-utils/node'
import { RenderOpts, renderToHTML } from './render'
import { ParsedUrl, parseUrl } from '../shared/lib/router/utils/parse-url'
import { parse as nodeParseUrl } from 'url'
import * as Log from '../build/output/log'

import BaseServer, {
  Options,
  FindComponentsResult,
  MiddlewareRoutingItem,
  NoFallbackError,
  RequestContext,
} from './base-server'
import { getMaybePagePath, getPagePath, requireFontManifest } from './require'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { loadComponents } from './load-components'
import isError, { getProperError } from '../lib/is-error'
import { FontManifest } from './font-utils'
import { splitCookiesString, toNodeHeaders } from './web/utils'
import { relativizeURL } from '../shared/lib/router/utils/relativize-url'
import { prepareDestination } from '../shared/lib/router/utils/prepare-destination'
import { getMiddlewareRouteMatcher } from '../shared/lib/router/utils/middleware-route-matcher'
import { loadEnvConfig } from '@next/env'
import { getCustomRoute, stringifyQuery } from './server-route-utils'
import { urlQueryToSearchParams } from '../shared/lib/router/utils/querystring'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { getCloneableBody } from './body-streams'
import { checkIsOnDemandRevalidate } from './api-utils'
import ResponseCache from './response-cache'
import { IncrementalCache } from './lib/incremental-cache'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

import { setHttpClientAndAgentOptions } from './config'
import { RouteKind } from './future/route-kind'

import { PagesAPIRouteMatch } from './future/route-matches/pages-api-route-match'
import { MatchOptions } from './future/route-matcher-managers/route-matcher-manager'
import { INSTRUMENTATION_HOOK_FILENAME } from '../lib/constants'
import { getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import { nodeFs } from './lib/node-fs-methods'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'
import { invokeRequest } from './lib/server-ipc/invoke-request'
import { filterReqHeaders } from './lib/server-ipc/utils'
import { createRequestResponseMocks } from './lib/mock-request'
import chalk from 'next/dist/compiled/chalk'

export * from './base-server'

type ExpressMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void
) => void

export interface NodeRequestHandler {
  (
    req: IncomingMessage | BaseNextRequest,
    res: ServerResponse | BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

const MiddlewareMatcherCache = new WeakMap<
  MiddlewareManifest['middleware'][string],
  MiddlewareRouteMatch
>()

function getMiddlewareMatcher(
  info: MiddlewareManifest['middleware'][string]
): MiddlewareRouteMatch {
  const stored = MiddlewareMatcherCache.get(info)
  if (stored) {
    return stored
  }

  if (!Array.isArray(info.matchers)) {
    throw new Error(
      `Invariant: invalid matchers for middleware ${JSON.stringify(info)}`
    )
  }

  const matcher = getMiddlewareRouteMatcher(info.matchers)
  MiddlewareMatcherCache.set(info, matcher)
  return matcher
}

/**
 * Hardcoded every possible error status code that could be thrown by "serveStatic" method
 * This is done by searching "this.error" inside "send" module's source code:
 * https://github.com/pillarjs/send/blob/master/index.js
 * https://github.com/pillarjs/send/blob/develop/index.js
 */
const POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC = new Set([
  // send module will throw 500 when header is already sent or fs.stat error happens
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L392
  // Note: we will use Next.js built-in 500 page to handle 500 errors
  // 500,

  // send module will throw 404 when file is missing
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L421
  // Note: we will use Next.js built-in 404 page to handle 404 errors
  // 404,

  // send module will throw 403 when redirecting to a directory without enabling directory listing
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L484
  // Note: Next.js throws a different error (without status code) for directory listing
  // 403,

  // send module will throw 400 when fails to normalize the path
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L520
  400,

  // send module will throw 412 with conditional GET request
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L632
  412,

  // send module will throw 416 when range is not satisfiable
  // https://github.com/pillarjs/send/blob/53f0ab476145670a9bdd3dc722ab2fdc8d358fc6/index.js#L669
  416,
])

type RenderWorker = Worker & {
  initialize: typeof import('./lib/render-server').initialize
  deleteCache: typeof import('./lib/render-server').deleteCache
  deleteAppClientCache: typeof import('./lib/render-server').deleteAppClientCache
  clearModuleContext: typeof import('./lib/render-server').clearModuleContext
}

export default class NextNodeServer extends BaseServer {
  private imageResponseCache?: ResponseCache
  private compression?: ExpressMiddleware
  protected renderWorkersPromises?: Promise<void>
  protected renderWorkers?: {
    middleware?: RenderWorker
    pages?: RenderWorker
    app?: RenderWorker
  }
  protected renderWorkerOpts?: Parameters<
    typeof import('./lib/render-server').initialize
  >[0]
  protected dynamicRoutes?: {
    match: import('../shared/lib/router/utils/route-matcher').RouteMatchFn
    page: string
    re: RegExp
  }[]

  constructor(options: Options) {
    // Initialize super class
    super(options)

    /**
     * This sets environment variable to be used at the time of SSR by head.tsx.
     * Using this from process.env allows targeting SSR by calling
     * `process.env.__NEXT_OPTIMIZE_CSS`.
     */
    if (this.renderOpts.optimizeFonts) {
      process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(
        this.renderOpts.optimizeFonts
      )
    }
    if (this.renderOpts.optimizeCss) {
      process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
    }
    if (this.renderOpts.nextScriptWorkers) {
      process.env.__NEXT_SCRIPT_WORKERS = JSON.stringify(true)
    }

    if (this.nextConfig.compress) {
      this.compression = require('next/dist/compiled/compression')()
    }

    if (!this.minimalMode) {
      this.imageResponseCache = new ResponseCache(this.minimalMode)
    }

    if (!options.dev && !this.nextConfig.experimental.appDocumentPreloading) {
      // pre-warm _document and _app as these will be
      // needed for most requests
      loadComponents({
        distDir: this.distDir,
        pathname: '/_document',
        hasServerComponents: false,
        isAppPath: false,
      }).catch(() => {})
      loadComponents({
        distDir: this.distDir,
        pathname: '/_app',
        hasServerComponents: false,
        isAppPath: false,
      }).catch(() => {})
    }

    if (this.isRouterWorker) {
      this.renderWorkers = {}
      this.renderWorkerOpts = {
        port: this.port || 0,
        dir: this.dir,
        workerType: 'render',
        hostname: this.hostname,
        minimalMode: this.minimalMode,
        dev: !!options.dev,
      }
      const { createWorker, createIpcServer } =
        require('./lib/server-ipc') as typeof import('./lib/server-ipc')
      this.renderWorkersPromises = new Promise<void>(async (resolveWorkers) => {
        try {
          this.renderWorkers = {}
          const { ipcPort, ipcValidationKey } = await createIpcServer(this)
          if (this.hasAppDir) {
            this.renderWorkers.app = createWorker(
              this.port || 0,
              ipcPort,
              ipcValidationKey,
              options.isNodeDebugging,
              'app',
              this.nextConfig.experimental.serverActions
            )
          }
          this.renderWorkers.pages = createWorker(
            this.port || 0,
            ipcPort,
            ipcValidationKey,
            options.isNodeDebugging,
            'pages'
          )
          this.renderWorkers.middleware =
            this.renderWorkers.pages || this.renderWorkers.app

          resolveWorkers()
        } catch (err) {
          Log.error(`Invariant failed to initialize render workers`)
          console.error(err)
          process.exit(1)
        }
      })
      ;(global as any)._nextDeleteCache = (filePath: string) => {
        try {
          this.renderWorkers?.pages?.deleteCache(filePath)
          this.renderWorkers?.app?.deleteCache(filePath)
        } catch (err) {
          console.error(err)
        }
      }
      ;(global as any)._nextDeleteAppClientCache = () => {
        try {
          this.renderWorkers?.pages?.deleteAppClientCache()
          this.renderWorkers?.app?.deleteAppClientCache()
        } catch (err) {
          console.error(err)
        }
      }
      ;(global as any)._nextClearModuleContext = (
        targetPath: any,
        content: any
      ) => {
        try {
          this.renderWorkers?.pages?.clearModuleContext(targetPath, content)
          this.renderWorkers?.app?.clearModuleContext(targetPath, content)
        } catch (err) {
          console.error(err)
        }
      }
    }

    // ensure options are set when loadConfig isn't called
    setHttpClientAndAgentOptions(this.nextConfig)
  }

  protected async prepareImpl() {
    await super.prepareImpl()
    if (
      !this.serverOptions.dev &&
      this.nextConfig.experimental.instrumentationHook
    ) {
      try {
        const instrumentationHook = await require(resolve(
          this.serverOptions.dir || '.',
          this.serverOptions.conf.distDir!,
          'server',
          INSTRUMENTATION_HOOK_FILENAME
        ))
        await instrumentationHook.register?.()
      } catch (err: any) {
        if (err.code !== 'MODULE_NOT_FOUND') {
          err.message = `An error occurred while loading instrumentation hook: ${err.message}`
          throw err
        }
      }
    }
  }

  protected loadEnvConfig({
    dev,
    forceReload,
    silent,
  }: {
    dev: boolean
    forceReload?: boolean
    silent?: boolean
  }) {
    loadEnvConfig(
      this.dir,
      dev,
      silent ? { info: () => {}, error: () => {} } : Log,
      forceReload
    )
  }

  protected getIncrementalCache({
    requestHeaders,
    requestProtocol,
  }: {
    requestHeaders: IncrementalCache['requestHeaders']
    requestProtocol: 'http' | 'https'
  }) {
    const dev = !!this.renderOpts.dev
    let CacheHandler: any
    const { incrementalCacheHandlerPath } = this.nextConfig.experimental

    if (incrementalCacheHandlerPath) {
      CacheHandler = require(isAbsolute(incrementalCacheHandlerPath)
        ? incrementalCacheHandlerPath
        : join(this.distDir, incrementalCacheHandlerPath))
      CacheHandler = CacheHandler.default || CacheHandler
    }

    // incremental-cache is request specific with a shared
    // although can have shared caches in module scope
    // per-cache handler
    return new IncrementalCache({
      fs: this.getCacheFilesystem(),
      dev,
      requestHeaders,
      requestProtocol,
      appDir: this.hasAppDir,
      allowedRevalidateHeaderKeys:
        this.nextConfig.experimental.allowedRevalidateHeaderKeys,
      minimalMode: this.minimalMode,
      serverDistDir: this.serverDistDir,
      fetchCache: this.nextConfig.experimental.appDir,
      fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
      maxMemoryCacheSize: this.nextConfig.experimental.isrMemoryCacheSize,
      flushToDisk:
        !this.minimalMode && this.nextConfig.experimental.isrFlushToDisk,
      getPrerenderManifest: () => this.getPrerenderManifest(),
      CurCacheHandler: CacheHandler,
    })
  }

  protected getResponseCache() {
    return new ResponseCache(this.minimalMode)
  }

  protected getPublicDir(): string {
    return join(this.dir, CLIENT_PUBLIC_FILES_PATH)
  }

  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
  }

  protected getPagesManifest(): PagesManifest | undefined {
    return require(join(this.serverDistDir, PAGES_MANIFEST))
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.hasAppDir) return undefined

    const appPathsManifestPath = join(this.serverDistDir, APP_PATHS_MANIFEST)
    return require(appPathsManifestPath)
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    return !!getMaybePagePath(
      pathname,
      this.distDir,
      this.nextConfig.i18n?.locales,
      this.hasAppDir
    )
  }

  protected getBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err) {
      if (!fs.existsSync(buildIdFile)) {
        throw new Error(
          `Could not find a production build in the '${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id`
        )
      }

      throw err
    }
  }

  protected getCustomRoutes(): CustomRoutes {
    const customRoutes = this.getRoutesManifest()
    let rewrites: CustomRoutes['rewrites']

    // rewrites can be stored as an array when an array is
    // returned in next.config.js so massage them into
    // the expected object format
    if (Array.isArray(customRoutes.rewrites)) {
      rewrites = {
        beforeFiles: [],
        afterFiles: customRoutes.rewrites,
        fallback: [],
      }
    } else {
      rewrites = customRoutes.rewrites
    }
    return Object.assign(customRoutes, { rewrites })
  }

  protected generateImageRoutes(): Route[] {
    return [
      {
        match: getPathMatch('/_next/image'),
        type: 'route',
        name: '_next/image catchall',
        fn: async (req, res, _params, parsedUrl) => {
          if (this.minimalMode || this.nextConfig.output === 'export') {
            res.statusCode = 400
            res.body('Bad Request').send()
            return {
              finished: true,
            }
          }
          const { ImageOptimizerCache } =
            require('./image-optimizer') as typeof import('./image-optimizer')

          const imageOptimizerCache = new ImageOptimizerCache({
            distDir: this.distDir,
            nextConfig: this.nextConfig,
          })

          const { getHash, sendResponse, ImageError } =
            require('./image-optimizer') as typeof import('./image-optimizer')

          if (!this.imageResponseCache) {
            throw new Error(
              'invariant image optimizer cache was not initialized'
            )
          }
          const imagesConfig = this.nextConfig.images

          if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
            await this.render404(req, res)
            return { finished: true }
          }
          const paramsResult = ImageOptimizerCache.validateParams(
            (req as NodeNextRequest).originalRequest,
            parsedUrl.query,
            this.nextConfig,
            !!this.renderOpts.dev
          )

          if ('errorMessage' in paramsResult) {
            res.statusCode = 400
            res.body(paramsResult.errorMessage).send()
            return { finished: true }
          }
          const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult)

          try {
            const cacheEntry = await this.imageResponseCache.get(
              cacheKey,
              async () => {
                const { buffer, contentType, maxAge } =
                  await this.imageOptimizer(
                    req as NodeNextRequest,
                    res as NodeNextResponse,
                    paramsResult
                  )
                const etag = getHash([buffer])

                return {
                  value: {
                    kind: 'IMAGE',
                    buffer,
                    etag,
                    extension: getExtension(contentType) as string,
                  },
                  revalidate: maxAge,
                }
              },
              {
                incrementalCache: imageOptimizerCache,
              }
            )

            if (cacheEntry?.value?.kind !== 'IMAGE') {
              throw new Error(
                'invariant did not get entry from image response cache'
              )
            }

            sendResponse(
              (req as NodeNextRequest).originalRequest,
              (res as NodeNextResponse).originalResponse,
              paramsResult.href,
              cacheEntry.value.extension,
              cacheEntry.value.buffer,
              paramsResult.isStatic,
              cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT',
              imagesConfig,
              cacheEntry.revalidate || 0,
              Boolean(this.renderOpts.dev)
            )
          } catch (err) {
            if (err instanceof ImageError) {
              res.statusCode = err.statusCode
              res.body(err.message).send()
              return {
                finished: true,
              }
            }
            throw err
          }
          return { finished: true }
        },
      },
    ]
  }

  protected getHasAppDir(dev: boolean): boolean {
    return Boolean(findDir(dev ? this.dir : this.serverDistDir, 'app'))
  }

  protected generateStaticRoutes(): Route[] {
    return this.hasStaticDir
      ? [
          {
            // It's very important to keep this route's param optional.
            // (but it should support as many params as needed, separated by '/')
            // Otherwise this will lead to a pretty simple DOS attack.
            // See more: https://github.com/vercel/next.js/issues/2617
            match: getPathMatch('/static/:path*'),
            name: 'static catchall',
            fn: async (req, res, params, parsedUrl) => {
              const p = join(this.dir, 'static', ...params.path)
              await this.serveStatic(req, res, p, parsedUrl)
              return {
                finished: true,
              }
            },
          } as Route,
        ]
      : []
  }

  protected setImmutableAssetCacheControl(res: BaseNextResponse): void {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }

  protected generateFsStaticRoutes(): Route[] {
    return [
      {
        match: getPathMatch('/_next/static/:path*'),
        type: 'route',
        name: '_next/static catchall',
        fn: async (req, res, params, parsedUrl) => {
          // make sure to 404 for /_next/static itself
          if (!params.path) {
            await this.render404(req, res, parsedUrl)
            return {
              finished: true,
            }
          }

          if (
            params.path[0] === CLIENT_STATIC_FILES_RUNTIME ||
            params.path[0] === 'chunks' ||
            params.path[0] === 'css' ||
            params.path[0] === 'image' ||
            params.path[0] === 'media' ||
            params.path[0] === this.buildId ||
            params.path[0] === 'pages' ||
            params.path[1] === 'pages'
          ) {
            this.setImmutableAssetCacheControl(res)
          }
          const p = join(
            this.distDir,
            CLIENT_STATIC_FILES_PATH,
            ...(params.path || [])
          )
          await this.serveStatic(req, res, p, parsedUrl)
          return {
            finished: true,
          }
        },
      },
    ]
  }

  protected generatePublicRoutes(): Route[] {
    if (!fs.existsSync(this.publicDir)) return []

    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map((p) =>
        encodeURI(p.replace(/\\/g, '/'))
      )
    )

    return [
      {
        match: getPathMatch('/:path*'),
        matchesBasePath: true,
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const pathParts: string[] = params.path || []
          const { basePath } = this.nextConfig

          // if basePath is defined require it be present
          if (basePath) {
            const basePathParts = basePath.split('/')
            // remove first empty value
            basePathParts.shift()

            if (
              !basePathParts.every((part: string, idx: number) => {
                return part === pathParts[idx]
              })
            ) {
              return { finished: false }
            }

            pathParts.splice(0, basePathParts.length)
          }

          let path = `/${pathParts.join('/')}`

          if (!publicFiles.has(path)) {
            // In `next-dev-server.ts`, we ensure encoded paths match
            // decoded paths on the filesystem. So we need do the
            // opposite here: make sure decoded paths match encoded.
            path = encodeURI(path)
          }

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              join(this.publicDir, ...pathParts),
              parsedUrl
            )
            return {
              finished: true,
            }
          }
          return {
            finished: false,
          }
        },
      } as Route,
    ]
  }

  private _validFilesystemPathSet: Set<string> | null = null
  protected getFilesystemPaths(): Set<string> {
    if (this._validFilesystemPathSet) {
      return this._validFilesystemPathSet
    }

    const pathUserFilesStatic = join(this.dir, 'static')
    let userFilesStatic: string[] = []
    if (this.hasStaticDir && fs.existsSync(pathUserFilesStatic)) {
      userFilesStatic = recursiveReadDirSync(pathUserFilesStatic).map((f) =>
        join('.', 'static', f)
      )
    }

    let userFilesPublic: string[] = []
    if (this.publicDir && fs.existsSync(this.publicDir)) {
      userFilesPublic = recursiveReadDirSync(this.publicDir).map((f) =>
        join('.', 'public', f)
      )
    }

    let nextFilesStatic: string[] = []

    nextFilesStatic =
      !this.minimalMode && fs.existsSync(join(this.distDir, 'static'))
        ? recursiveReadDirSync(join(this.distDir, 'static')).map((f) =>
            join('.', relative(this.dir, this.distDir), 'static', f)
          )
        : []

    return (this._validFilesystemPathSet = new Set<string>([
      ...nextFilesStatic,
      ...userFilesPublic,
      ...userFilesStatic,
    ]))
  }

  protected sendRenderResult(
    req: NodeNextRequest,
    res: NodeNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions | undefined
    }
  ): Promise<void> {
    return sendRenderResult({
      req: req.originalRequest,
      res: res.originalResponse,
      ...options,
    })
  }

  protected sendStatic(
    req: NodeNextRequest,
    res: NodeNextResponse,
    path: string
  ): Promise<void> {
    return serveStatic(req.originalRequest, res.originalResponse, path)
  }

  protected handleCompression(
    req: NodeNextRequest,
    res: NodeNextResponse
  ): void {
    if (this.compression) {
      this.compression(req.originalRequest, res.originalResponse, () => {})
    }
  }

  protected async handleUpgrade(req: NodeNextRequest, socket: any, head: any) {
    await this.router.execute(req, socket, nodeParseUrl(req.url, true), head)
  }

  protected async proxyRequest(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: ParsedUrl,
    upgradeHead?: any
  ) {
    const { query } = parsedUrl
    delete (parsedUrl as any).query
    parsedUrl.search = stringifyQuery(req, query)

    const target = formatUrl(parsedUrl)
    const HttpProxy =
      require('next/dist/compiled/http-proxy') as typeof import('next/dist/compiled/http-proxy')
    const proxy = new HttpProxy({
      target,
      changeOrigin: true,
      ignorePath: true,
      xfwd: true,
      ws: true,
      // we limit proxy requests to 30s by default, in development
      // we don't time out WebSocket requests to allow proxying
      proxyTimeout:
        upgradeHead && this.renderOpts.dev
          ? undefined
          : this.nextConfig.experimental.proxyTimeout || 30_000,
    })

    await new Promise((proxyResolve, proxyReject) => {
      let finished = false

      proxy.on('error', (err) => {
        console.error(`Failed to proxy ${target}`, err)
        if (!finished) {
          finished = true
          proxyReject(err)
        }
      })

      // if upgrade head is present treat as WebSocket request
      if (upgradeHead) {
        proxy.on('proxyReqWs', (proxyReq) => {
          proxyReq.on('close', () => {
            if (!finished) {
              finished = true
              proxyResolve(true)
            }
          })
        })
        proxy.ws(req as any as IncomingMessage, res, upgradeHead)
        proxyResolve(true)
      } else {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.on('close', () => {
            if (!finished) {
              finished = true
              proxyResolve(true)
            }
          })
        })
        proxy.web(req.originalRequest, res.originalResponse, {
          buffer: getRequestMeta(
            req,
            '__NEXT_CLONABLE_BODY'
          )?.cloneBodyStream(),
        })
      }
    })

    return {
      finished: true,
    }
  }

  protected async runApi(
    req: BaseNextRequest | NodeNextRequest,
    res: BaseNextResponse | NodeNextResponse,
    query: ParsedUrlQuery,
    params: Params | undefined,
    page: string,
    builtPagePath: string
  ): Promise<boolean> {
    const edgeFunctionsPages = this.getEdgeFunctionsPages()

    for (const edgeFunctionsPage of edgeFunctionsPages) {
      if (edgeFunctionsPage === page) {
        const handledAsEdgeFunction = await this.runEdgeFunction({
          req,
          res,
          query,
          params,
          page,
          appPaths: null,
        })

        if (handledAsEdgeFunction) {
          return true
        }
      }
    }

    const pageModule = await require(builtPagePath)
    query = { ...query, ...params }

    delete query.__nextLocale
    delete query.__nextDefaultLocale
    delete query.__nextInferredLocaleFromDefault

    await apiResolver(
      (req as NodeNextRequest).originalRequest,
      (res as NodeNextResponse).originalResponse,
      query,
      pageModule,
      {
        ...this.renderOpts.previewProps,
        revalidate: this.revalidate.bind(this),
        // internal config so is not typed
        trustHostHeader: (this.nextConfig.experimental as Record<string, any>)
          .trustHostHeader,
        allowedRevalidateHeaderKeys:
          this.nextConfig.experimental.allowedRevalidateHeaderKeys,
        hostname: this.hostname,
      },
      this.minimalMode,
      this.renderOpts.dev,
      page
    )
    return true
  }

  protected async renderHTML(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult> {
    return getTracer().trace(NextNodeServerSpan.renderHTML, async () =>
      this.renderHTMLImpl(req, res, pathname, query, renderOpts)
    )
  }

  private async renderHTMLImpl(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult> {
    // Due to the way we pass data by mutating `renderOpts`, we can't extend the
    // object here but only updating its `clientReferenceManifest` field.
    // https://github.com/vercel/next.js/blob/df7cbd904c3bd85f399d1ce90680c0ecf92d2752/packages/next/server/render.tsx#L947-L952
    renderOpts.clientReferenceManifest = this.clientReferenceManifest
    renderOpts.serverCSSManifest = this.serverCSSManifest
    renderOpts.nextFontManifest = this.nextFontManifest

    if (this.hasAppDir && renderOpts.isAppPath) {
      const { renderToHTMLOrFlight: appRenderToHTMLOrFlight } =
        require('./app-render/app-render') as typeof import('./app-render/app-render')
      return appRenderToHTMLOrFlight(
        req.originalRequest,
        res.originalResponse,
        pathname,
        query,
        renderOpts
      )
    }

    return renderToHTML(
      req.originalRequest,
      res.originalResponse,
      pathname,
      query,
      renderOpts
    )
  }

  protected streamResponseChunk(res: NodeNextResponse, chunk: any) {
    res.originalResponse.write(chunk)

    // When both compression and streaming are enabled, we need to explicitly
    // flush the response to avoid it being buffered by gzip.
    if (this.compression && 'flush' in res.originalResponse) {
      ;(res.originalResponse as any).flush()
    }
  }

  protected async imageOptimizer(
    req: NodeNextRequest,
    res: NodeNextResponse,
    paramsResult: import('./image-optimizer').ImageParamsResult
  ): Promise<{ buffer: Buffer; contentType: string; maxAge: number }> {
    const { imageOptimizer } =
      require('./image-optimizer') as typeof import('./image-optimizer')

    return imageOptimizer(
      req.originalRequest,
      res.originalResponse,
      paramsResult,
      this.nextConfig,
      this.renderOpts.dev,
      (newReq, newRes, newParsedUrl) =>
        this.getRequestHandler()(
          new NodeNextRequest(newReq),
          new NodeNextResponse(newRes),
          newParsedUrl
        )
    )
  }

  protected getPagePath(pathname: string, locales?: string[]): string {
    return getPagePath(pathname, this.distDir, locales, this.hasAppDir)
  }

  protected async renderPageComponent(
    ctx: RequestContext,
    bubbleNoFallback: boolean
  ) {
    const edgeFunctionsPages = this.getEdgeFunctionsPages() || []
    if (edgeFunctionsPages.length) {
      const appPaths = this.getOriginalAppPaths(ctx.pathname)
      const isAppPath = Array.isArray(appPaths)

      let page = ctx.pathname
      if (isAppPath) {
        // When it's an array, we need to pass all parallel routes to the loader.
        page = appPaths[0]
      }

      for (const edgeFunctionsPage of edgeFunctionsPages) {
        if (edgeFunctionsPage === page) {
          await this.runEdgeFunction({
            req: ctx.req,
            res: ctx.res,
            query: ctx.query,
            params: ctx.renderOpts.params,
            page,
            appPaths,
          })
          return null
        }
      }
    }

    return super.renderPageComponent(ctx, bubbleNoFallback)
  }

  protected async findPageComponents({
    pathname,
    query,
    params,
    isAppPath,
  }: {
    pathname: string
    query: NextParsedUrlQuery
    params: Params | null
    isAppPath: boolean
  }): Promise<FindComponentsResult | null> {
    let route = pathname
    if (isAppPath) {
      // When in App we get page instead of route
      route = pathname.replace(/\/[^/]*$/, '')
    }

    return getTracer().trace(
      NextNodeServerSpan.findPageComponents,
      {
        spanName: `resolving page into components`,
        attributes: {
          'next.route': route,
        },
      },
      () => this.findPageComponentsImpl({ pathname, query, params, isAppPath })
    )
  }

  private async findPageComponentsImpl({
    pathname,
    query,
    params,
    isAppPath,
  }: {
    pathname: string
    query: NextParsedUrlQuery
    params: Params | null
    isAppPath: boolean
  }): Promise<FindComponentsResult | null> {
    const paths: string[] = [pathname]
    if (query.amp) {
      // try serving a static AMP version first
      paths.unshift(
        (isAppPath ? normalizeAppPath(pathname) : normalizePagePath(pathname)) +
          '.amp'
      )
    }

    if (query.__nextLocale) {
      paths.unshift(
        ...paths.map(
          (path) => `/${query.__nextLocale}${path === '/' ? '' : path}`
        )
      )
    }

    for (const pagePath of paths) {
      try {
        const components = await loadComponents({
          distDir: this.distDir,
          pathname: pagePath,
          hasServerComponents: !!this.renderOpts.serverComponents,
          isAppPath,
        })

        if (
          query.__nextLocale &&
          typeof components.Component === 'string' &&
          !pagePath.startsWith(`/${query.__nextLocale}`)
        ) {
          // if loading an static HTML file the locale is required
          // to be present since all HTML files are output under their locale
          continue
        }

        return {
          components,
          query: {
            ...(components.getStaticProps
              ? ({
                  amp: query.amp,
                  __nextDataReq: query.__nextDataReq,
                  __nextLocale: query.__nextLocale,
                  __nextDefaultLocale: query.__nextDefaultLocale,
                } as NextParsedUrlQuery)
              : query),
            // For appDir params is excluded.
            ...((isAppPath ? {} : params) || {}),
          },
        }
      } catch (err) {
        // we should only not throw if we failed to find the page
        // in the pages-manifest
        if (!(err instanceof PageNotFoundError)) {
          throw err
        }
      }
    }
    return null
  }

  protected getFontManifest(): FontManifest {
    return requireFontManifest(this.distDir)
  }

  protected getServerComponentManifest() {
    if (!this.hasAppDir) return undefined
    return require(join(
      this.distDir,
      'server',
      CLIENT_REFERENCE_MANIFEST + '.json'
    ))
  }

  protected getServerCSSManifest() {
    if (!this.hasAppDir) return undefined
    return require(join(
      this.distDir,
      'server',
      FLIGHT_SERVER_CSS_MANIFEST + '.json'
    ))
  }

  protected getNextFontManifest() {
    return require(join(this.distDir, 'server', `${NEXT_FONT_MANIFEST}.json`))
  }

  protected async getFallback(page: string): Promise<string> {
    page = normalizePagePath(page)
    const cacheFs = this.getCacheFilesystem()
    const html = await cacheFs.readFile(
      join(this.serverDistDir, 'pages', `${page}.html`)
    )

    return html.toString('utf8')
  }

  protected generateRoutes(dev?: boolean): RouterOptions {
    const publicRoutes = this.generatePublicRoutes()
    const imageRoutes = this.generateImageRoutes()
    const staticFilesRoutes = this.generateStaticRoutes()

    if (!dev) {
      const routesManifest = this.getRoutesManifest() as {
        dynamicRoutes: {
          page: string
          regex: string
          namedRegex?: string
          routeKeys?: { [key: string]: string }
        }[]
      }
      this.dynamicRoutes = routesManifest.dynamicRoutes.map((r) => {
        const regex = getRouteRegex(r.page)
        const match = getRouteMatcher(regex)

        return {
          match,
          page: r.page,
          regex: regex.re,
        }
      }) as any
    }

    const fsRoutes: Route[] = [
      ...this.generateFsStaticRoutes(),
      {
        match: getPathMatch('/_next/data/:path*'),
        type: 'route',
        name: '_next/data catchall',
        check: true,
        fn: async (req, res, params, _parsedUrl) => {
          const isNextDataNormalizing = getRequestMeta(
            req,
            '_nextDataNormalizing'
          )

          // Make sure to 404 for /_next/data/ itself and
          // we also want to 404 if the buildId isn't correct
          if (!params.path || params.path[0] !== this.buildId) {
            if (isNextDataNormalizing) {
              return { finished: false }
            }
            await this.render404(req, res, _parsedUrl)
            return {
              finished: true,
            }
          }
          // remove buildId from URL
          params.path.shift()

          const lastParam = params.path[params.path.length - 1]

          // show 404 if it doesn't end with .json
          if (typeof lastParam !== 'string' || !lastParam.endsWith('.json')) {
            await this.render404(req, res, _parsedUrl)
            return {
              finished: true,
            }
          }

          // re-create page's pathname
          let pathname = `/${params.path.join('/')}`
          pathname = getRouteFromAssetPath(pathname, '.json')

          // ensure trailing slash is normalized per config
          if (this.router.hasMiddleware) {
            if (this.nextConfig.trailingSlash && !pathname.endsWith('/')) {
              pathname += '/'
            }
            if (
              !this.nextConfig.trailingSlash &&
              pathname.length > 1 &&
              pathname.endsWith('/')
            ) {
              pathname = pathname.substring(0, pathname.length - 1)
            }
          }

          if (this.i18nProvider) {
            // Remove the port from the hostname if present.
            const hostname = req?.headers.host?.split(':')[0].toLowerCase()

            const domainLocale = this.i18nProvider.detectDomainLocale(hostname)
            const defaultLocale =
              domainLocale?.defaultLocale ??
              this.i18nProvider.config.defaultLocale

            const localePathResult = this.i18nProvider.analyze(pathname)

            // If the locale is detected from the path, we need to remove it
            // from the pathname.
            if (localePathResult.detectedLocale) {
              pathname = localePathResult.pathname
            }

            // Update the query with the detected locale and default locale.
            _parsedUrl.query.__nextLocale = localePathResult.detectedLocale
            _parsedUrl.query.__nextDefaultLocale = defaultLocale

            // If the locale is not detected from the path, we need to mark that
            // it was not inferred from default.
            if (!_parsedUrl.query.__nextLocale) {
              delete _parsedUrl.query.__nextInferredLocaleFromDefault
            }

            // If no locale was detected and we don't have middleware, we need
            // to render a 404 page.
            // NOTE: (wyattjoh) we may need to change this for app/
            if (
              !localePathResult.detectedLocale &&
              !this.router.hasMiddleware
            ) {
              _parsedUrl.query.__nextLocale = defaultLocale
              await this.render404(req, res, _parsedUrl)
              return { finished: true }
            }
          }

          return {
            pathname,
            query: { ..._parsedUrl.query, __nextDataReq: '1' },
            finished: false,
          }
        },
      },
      ...imageRoutes,
      {
        match: getPathMatch('/_next/:path*'),
        type: 'route',
        name: '_next catchall',
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
          return {
            finished: true,
          }
        },
      },
      ...publicRoutes,
      ...staticFilesRoutes,
    ]

    const restrictedRedirectPaths = this.nextConfig.basePath
      ? [`${this.nextConfig.basePath}/_next`]
      : ['/_next']

    // Headers come very first
    const headers =
      this.minimalMode || this.isRenderWorker
        ? []
        : this.customRoutes.headers.map((rule) =>
            createHeaderRoute({ rule, restrictedRedirectPaths })
          )

    const redirects =
      this.minimalMode || this.isRenderWorker
        ? []
        : this.customRoutes.redirects.map((rule) =>
            createRedirectRoute({ rule, restrictedRedirectPaths })
          )

    const rewrites = this.generateRewrites({ restrictedRedirectPaths })
    const catchAllMiddleware = this.generateCatchAllMiddlewareRoute()

    const catchAllRoute: Route = {
      match: getPathMatch('/:path*'),
      type: 'route',
      matchesLocale: true,
      name: 'Catchall render',
      fn: async (req, res, _params, parsedUrl) => {
        let { pathname, query } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        const bubbleNoFallback = Boolean(query._nextBubbleNoFallback)

        // next.js core assumes page path without trailing slash
        pathname = removeTrailingSlash(pathname)

        const options: MatchOptions = {
          i18n: this.i18nProvider?.fromQuery(pathname, query),
        }

        const match = await this.matchers.match(pathname, options)

        if (this.isRouterWorker) {
          let page = pathname
          let matchedExistingRoute = false

          if (!(await this.hasPage(page))) {
            for (const route of this.dynamicRoutes || []) {
              if (route.match(pathname)) {
                page = route.page
                matchedExistingRoute = true
                break
              }
            }
          } else {
            matchedExistingRoute = true
          }

          let renderKind: 'app' | 'pages' =
            this.appPathRoutes?.[page] ||
            // Possible that it's a dynamic app route or behind routing rules
            // such as i18n. In that case, we need to check the route kind directly.
            match?.definition.kind === RouteKind.APP_PAGE
              ? 'app'
              : 'pages'

          // Handle app dir's /not-found feature: for 404 pages, they should be
          // routed to the app renderer.
          if (!matchedExistingRoute && this.appPathRoutes) {
            if (
              this.appPathRoutes[
                this.renderOpts.dev ? '/not-found' : '/_not-found'
              ]
            ) {
              renderKind = 'app'
            }
          }

          if (this.renderWorkersPromises) {
            await this.renderWorkersPromises
            this.renderWorkersPromises = undefined
          }
          const renderWorker = this.renderWorkers?.[renderKind]

          if (renderWorker) {
            const initUrl = getRequestMeta(req, '__NEXT_INIT_URL')!
            const { port, hostname } = await renderWorker.initialize(
              this.renderWorkerOpts!
            )
            const renderUrl = new URL(initUrl)
            renderUrl.hostname = hostname
            renderUrl.port = port + ''

            let invokePathname = pathname
            const normalizedInvokePathname =
              this.localeNormalizer?.normalize(pathname)

            if (normalizedInvokePathname?.startsWith('/api')) {
              invokePathname = normalizedInvokePathname
            } else if (
              query.__nextLocale &&
              !pathHasPrefix(invokePathname, `/${query.__nextLocale}`)
            ) {
              invokePathname = `/${query.__nextLocale}${
                invokePathname === '/' ? '' : invokePathname
              }`
            }

            if (query.__nextDataReq) {
              invokePathname = `/_next/data/${this.buildId}${invokePathname}.json`
            }
            invokePathname = addPathPrefix(
              invokePathname,
              this.nextConfig.basePath
            )
            const keptQuery: ParsedUrlQuery = {}

            for (const key of Object.keys(query)) {
              if (key.startsWith('__next') || key.startsWith('_next')) {
                continue
              }
              keptQuery[key] = query[key]
            }
            if (query._nextBubbleNoFallback) {
              keptQuery._nextBubbleNoFallback = '1'
            }
            const invokeQuery = JSON.stringify(keptQuery)

            const invokeHeaders: typeof req.headers = {
              'cache-control': '',
              ...req.headers,
              'x-middleware-invoke': '',
              'x-invoke-path': invokePathname,
              'x-invoke-query': encodeURIComponent(invokeQuery),
            }
            ;(req as any).didInvokePath = true
            const invokeRes = await invokeRequest(
              renderUrl.toString(),
              {
                headers: invokeHeaders,
                method: req.method,
              },
              getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
            )
            const noFallback = invokeRes.headers['x-no-fallback']

            if (noFallback) {
              if (bubbleNoFallback) {
                return { finished: false }
              } else {
                await this.render404(req, res, parsedUrl)
                return {
                  finished: true,
                }
              }
            }

            for (const [key, value] of Object.entries(
              filterReqHeaders({ ...invokeRes.headers })
            )) {
              if (value !== undefined) {
                if (key === 'set-cookie') {
                  const curValue = res.getHeader(key)
                  const newValue: string[] = [] as string[]
                  for (const cookie of splitCookiesString(curValue || '')) {
                    newValue.push(cookie)
                  }
                  for (const val of (Array.isArray(value)
                    ? value
                    : value
                    ? [value]
                    : []) as string[]) {
                    newValue.push(val)
                  }
                  res.setHeader(key, newValue)
                } else {
                  res.setHeader(key, value as string)
                }
              }
            }
            res.statusCode = invokeRes.statusCode
            res.statusMessage = invokeRes.statusMessage

            for await (const chunk of invokeRes) {
              this.streamResponseChunk(res as NodeNextResponse, chunk)
            }
            ;(res as NodeNextResponse).originalResponse.end()
            return {
              finished: true,
            }
          }
        }

        if (match) {
          addRequestMeta(req, '_nextMatch', match)
        }

        // Try to handle the given route with the configured handlers.
        if (match) {
          // Add the match to the request so we don't have to re-run the matcher
          // for the same request.
          addRequestMeta(req, '_nextMatch', match)

          // TODO-APP: move this to a route handler
          const edgeFunctionsPages = this.getEdgeFunctionsPages()
          for (const edgeFunctionsPage of edgeFunctionsPages) {
            if (edgeFunctionsPage === match.definition.page) {
              if (this.nextConfig.output === 'export') {
                await this.render404(req, res, parsedUrl)
                return { finished: true }
              }
              delete query._nextBubbleNoFallback

              const handledAsEdgeFunction = await this.runEdgeFunction({
                req,
                res,
                query,
                params: match.params,
                page: match.definition.page,
                match,
                appPaths: null,
              })

              if (handledAsEdgeFunction) {
                return { finished: true }
              }
            }
          }
          let handled = false

          // If the route was detected as being a Pages API route, then handle
          // it.
          // TODO: move this behavior into a route handler.
          if (match.definition.kind === RouteKind.PAGES_API) {
            if (this.nextConfig.output === 'export') {
              await this.render404(req, res, parsedUrl)
              return { finished: true }
            }
            delete query._nextBubbleNoFallback

            handled = await this.handleApiRequest(
              req,
              res,
              query,
              // TODO: see if we can add a runtime check for this
              match as PagesAPIRouteMatch
            )
            if (handled) return { finished: true }
          }
          // else if (match.definition.kind === RouteKind.METADATA_ROUTE) {
          //   handled = await this.handlers.handle(match, req, res)
          //   if (handled) return { finished: true }
          // }
        }

        try {
          await this.render(req, res, pathname, query, parsedUrl, true)

          return {
            finished: true,
          }
        } catch (err) {
          if (err instanceof NoFallbackError && bubbleNoFallback) {
            if (this.isRenderWorker) {
              res.setHeader('x-no-fallback', '1')
              res.send()
              return {
                finished: true,
              }
            }

            return {
              finished: false,
            }
          }
          throw err
        }
      },
    }

    const { useFileSystemPublicRoutes } = this.nextConfig

    if (useFileSystemPublicRoutes) {
      this.appPathRoutes = this.getAppPathRoutes()
    }

    return {
      headers,
      fsRoutes,
      rewrites,
      redirects,
      catchAllRoute,
      catchAllMiddleware,
      useFileSystemPublicRoutes,
      matchers: this.matchers,
      nextConfig: this.nextConfig,
      i18nProvider: this.i18nProvider,
    }
  }

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  protected async handleApiRequest(
    req: BaseNextRequest,
    res: BaseNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    const {
      definition: { pathname, filename },
      params,
    } = match

    return this.runApi(req, res, query, params, pathname, filename)
  }

  protected getCacheFilesystem(): CacheFs {
    return nodeFs
  }

  private normalizeReq(
    req: BaseNextRequest | IncomingMessage
  ): BaseNextRequest {
    return req instanceof IncomingMessage ? new NodeNextRequest(req) : req
  }

  private normalizeRes(
    res: BaseNextResponse | ServerResponse
  ): BaseNextResponse {
    return res instanceof ServerResponse ? new NodeNextResponse(res) : res
  }

  public getRequestHandler(): NodeRequestHandler {
    // This is just optimization to fire prepare as soon as possible
    // It will be properly awaited later
    void this.prepare()
    const handler = super.getRequestHandler()
    return async (req, res, parsedUrl) => {
      const normalizedReq = this.normalizeReq(req)
      const normalizedRes = this.normalizeRes(res)

      if (this.renderOpts.dev) {
        const _req = req as NodeNextRequest | IncomingMessage
        const _res = res as NodeNextResponse | ServerResponse
        const origReq = 'originalRequest' in _req ? _req.originalRequest : _req
        const origRes =
          'originalResponse' in _res ? _res.originalResponse : _res

        const reqStart = Date.now()

        const reqCallback = () => {
          // if we already logged in a render worker
          // don't log again in the router worker.
          // we also don't log for middleware alone
          if (
            (normalizedReq as any).didInvokePath ||
            origReq.headers['x-middleware-invoke']
          ) {
            return
          }
          const reqEnd = Date.now()
          const fetchMetrics = (normalizedReq as any).fetchMetrics || []
          const reqDuration = reqEnd - reqStart

          const getDurationStr = (duration: number) => {
            let durationStr = duration.toString()

            if (duration < 500) {
              durationStr = chalk.green(duration + 'ms')
            } else if (duration < 2000) {
              durationStr = chalk.yellow(duration + 'ms')
            } else {
              durationStr = chalk.red(duration + 'ms')
            }
            return durationStr
          }

          if (Array.isArray(fetchMetrics) && fetchMetrics.length) {
            process.stdout.write('\n')
            process.stdout.write(
              `-  ${chalk.grey('┌')} ${chalk.cyan(req.method || 'GET')} ${
                req.url
              } ${res.statusCode} in ${getDurationStr(reqDuration)}\n`
            )

            const calcNestedLevel = (
              prevMetrics: any[],
              start: number
            ): string => {
              let nestedLevel = 0

              for (let i = 0; i < prevMetrics.length; i++) {
                const metric = prevMetrics[i]
                const prevMetric = prevMetrics[i - 1]

                if (
                  metric.end <= start &&
                  !(prevMetric && prevMetric.start < metric.end)
                ) {
                  nestedLevel += 1
                }
              }

              if (nestedLevel === 0) return ''
              return ` ${nestedLevel} level${nestedLevel === 1 ? '' : 's'} `
            }

            for (let i = 0; i < fetchMetrics.length; i++) {
              const metric = fetchMetrics[i]
              const lastItem = i === fetchMetrics.length - 1
              let cacheStatus = metric.cacheStatus
              const duration = metric.end - metric.start

              if (cacheStatus === 'hit') {
                cacheStatus = chalk.green('HIT')
              } else {
                cacheStatus = chalk.yellow('MISS')
              }
              let url = metric.url

              if (url.length > 48) {
                const parsed = new URL(url)
                const truncatedHost =
                  parsed.host.length > 16
                    ? parsed.host.substring(0, 16) + '..'
                    : parsed.host

                const truncatedPath =
                  parsed.pathname.length > 24
                    ? parsed.pathname.substring(0, 24) + '..'
                    : parsed.pathname

                const truncatedSearch =
                  parsed.search.length > 16
                    ? parsed.search.substring(0, 16) + '..'
                    : parsed.search

                url =
                  parsed.protocol +
                  '//' +
                  truncatedHost +
                  truncatedPath +
                  truncatedSearch
              }

              process.stdout.write(`   ${chalk.grey('│')}\n`)
              process.stdout.write(
                `   ${chalk.grey(
                  `${lastItem ? '└' : '├'}──${calcNestedLevel(
                    fetchMetrics.slice(0, i),
                    metric.start
                  )}──`
                )} ${chalk.cyan(metric.method)} ${url} ${
                  metric.status
                } in ${getDurationStr(duration)} (cache: ${cacheStatus})\n`
              )
            }
            process.stdout.write('\n')
          } else if (this.nextConfig.experimental.logging === 'verbose') {
            process.stdout.write(
              `- ${chalk.cyan(req.method || 'GET')} ${req.url} ${
                res.statusCode
              } in ${getDurationStr(reqDuration)}\n`
            )
          }
          origRes.off('close', reqCallback)
        }
        origRes.on('close', reqCallback)
      }
      return handler(normalizedReq, normalizedRes, parsedUrl)
    }
  }

  public async revalidate({
    urlPath,
    revalidateHeaders,
    opts,
  }: {
    urlPath: string
    revalidateHeaders: { [key: string]: string | string[] }
    opts: { unstable_onlyGenerated?: boolean }
  }) {
    const mocked = createRequestResponseMocks({
      url: urlPath,
      headers: revalidateHeaders,
    })

    const handler = this.getRequestHandler()
    await handler(
      new NodeNextRequest(mocked.req),
      new NodeNextResponse(mocked.res)
    )
    await mocked.res.hasStreamed

    if (
      mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
      !(mocked.res.statusCode === 404 && opts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${mocked.res.statusCode}`)
    }
    return {}
  }

  public async render(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    parsedUrl?: NextUrlWithParsedQuery,
    internal = false
  ): Promise<void> {
    return super.render(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      parsedUrl,
      internal
    )
  }

  public async renderToHTML(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderToHTML(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  public async renderError(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.renderError(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      setHeaders
    )
  }

  public async renderErrorToHTML(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderErrorToHTML(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  public async render404(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.render404(
      this.normalizeReq(req),
      this.normalizeRes(res),
      parsedUrl,
      setHeaders
    )
  }

  public async serveStatic(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    path: string,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    if (!this.isServableUrl(path)) {
      return this.render404(req, res, parsedUrl)
    }

    if (!(req.method === 'GET' || req.method === 'HEAD')) {
      res.statusCode = 405
      res.setHeader('Allow', ['GET', 'HEAD'])
      return this.renderError(null, req, res, path)
    }

    try {
      await this.sendStatic(
        req as NodeNextRequest,
        res as NodeNextResponse,
        path
      )
    } catch (error) {
      if (!isError(error)) throw error
      const err = error as Error & { code?: string; statusCode?: number }
      if (err.code === 'ENOENT' || err.statusCode === 404) {
        this.render404(req, res, parsedUrl)
      } else if (
        typeof err.statusCode === 'number' &&
        POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC.has(err.statusCode)
      ) {
        res.statusCode = err.statusCode
        return this.renderError(err, req, res, path)
      } else if ((err as any).expose === false) {
        res.statusCode = 400
        return this.renderError(null, req, res, path)
      } else {
        throw err
      }
    }
  }

  protected getStaticRoutes(): Route[] {
    return this.hasStaticDir
      ? [
          {
            // It's very important to keep this route's param optional.
            // (but it should support as many params as needed, separated by '/')
            // Otherwise this will lead to a pretty simple DOS attack.
            // See more: https://github.com/vercel/next.js/issues/2617
            match: getPathMatch('/static/:path*'),
            name: 'static catchall',
            fn: async (req, res, params, parsedUrl) => {
              const p = join(this.dir, 'static', ...params.path)
              await this.serveStatic(req, res, p, parsedUrl)
              return {
                finished: true,
              }
            },
          } as Route,
        ]
      : []
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
    const untrustedFilePath = resolve(decodedUntrustedFilePath)

    // don't allow null bytes anywhere in the file path
    if (untrustedFilePath.indexOf('\0') !== -1) {
      return false
    }

    // Check if .next/static, static and public are in the path.
    // If not the path is not available.
    if (
      (untrustedFilePath.startsWith(join(this.distDir, 'static') + sep) ||
        untrustedFilePath.startsWith(join(this.dir, 'static') + sep) ||
        untrustedFilePath.startsWith(join(this.dir, 'public') + sep)) === false
    ) {
      return false
    }

    // Check against the real filesystem paths
    const filesystemUrls = this.getFilesystemPaths()
    const resolved = relative(this.dir, untrustedFilePath)
    return filesystemUrls.has(resolved)
  }

  protected generateRewrites({
    restrictedRedirectPaths,
  }: {
    restrictedRedirectPaths: string[]
  }): { beforeFiles: Route[]; afterFiles: Route[]; fallback: Route[] } {
    let beforeFiles: Route[] = []
    let afterFiles: Route[] = []
    let fallback: Route[] = []

    if (!this.minimalMode && !this.isRenderWorker) {
      const buildRewrite = (rewrite: Rewrite, check = true): Route => {
        const rewriteRoute = getCustomRoute({
          type: 'rewrite',
          rule: rewrite,
          restrictedRedirectPaths,
        })
        return {
          ...rewriteRoute,
          check,
          type: rewriteRoute.type,
          name: `Rewrite route ${rewriteRoute.source}`,
          match: rewriteRoute.match,
          matchesBasePath: true,
          matchesLocale: true,
          matchesLocaleAPIRoutes: true,
          matchesTrailingSlash: true,
          fn: async (req, res, params, parsedUrl, upgradeHead) => {
            const { newUrl, parsedDestination } = prepareDestination({
              appendParamsToQuery: true,
              destination: rewriteRoute.destination,
              params: params,
              query: parsedUrl.query,
            })

            // external rewrite, proxy it
            if (parsedDestination.protocol) {
              return this.proxyRequest(
                req as NodeNextRequest,
                res as NodeNextResponse,
                parsedDestination,
                upgradeHead
              )
            }

            addRequestMeta(req, '_nextRewroteUrl', newUrl)
            addRequestMeta(req, '_nextDidRewrite', newUrl !== req.url)

            // Analyze the destination url to update the locale in the query if
            // it is enabled.
            if (this.i18nProvider) {
              // Base path should be stripped before we analyze the destination
              // url for locales if it is enabled.
              let pathname = newUrl
              if (this.nextConfig.basePath) {
                pathname = removePathPrefix(pathname, this.nextConfig.basePath)
              }

              // Assume the default locale from the query. We do this to ensure
              // that if the rewrite is specified without a locale we can
              // fallback to the correct locale. The domain didn't change, so
              // we can use the same default as before.
              const defaultLocale = parsedUrl.query.__nextDefaultLocale

              // Analyze the pathname to see if it detects a locale.
              const { detectedLocale, inferredFromDefault } =
                this.i18nProvider.analyze(pathname, { defaultLocale })

              // We update the locale in the query if it is detected. If it
              // wasn't detected it will fallback to the default locale.
              parsedUrl.query.__nextLocale = detectedLocale

              // Mark if the locale was inferred from the default locale.
              if (inferredFromDefault) {
                parsedUrl.query.__nextInferredLocaleFromDefault = '1'
              } else {
                delete parsedUrl.query.__nextInferredLocaleFromDefault
              }
            }

            return {
              finished: false,
              pathname: newUrl,
              query: parsedDestination.query,
            }
          },
        }
      }

      if (Array.isArray(this.customRoutes.rewrites)) {
        afterFiles = this.customRoutes.rewrites.map((r) => buildRewrite(r))
      } else {
        beforeFiles = this.customRoutes.rewrites.beforeFiles.map((r) =>
          buildRewrite(r, false)
        )
        afterFiles = this.customRoutes.rewrites.afterFiles.map((r) =>
          buildRewrite(r)
        )
        fallback = this.customRoutes.rewrites.fallback.map((r) =>
          buildRewrite(r)
        )
      }
    }

    return {
      beforeFiles,
      afterFiles,
      fallback,
    }
  }

  protected getMiddlewareManifest(): MiddlewareManifest | null {
    if (this.minimalMode) return null
    const manifest: MiddlewareManifest = require(join(
      this.serverDistDir,
      MIDDLEWARE_MANIFEST
    ))
    return manifest
  }

  /** Returns the middleware routing item if there is one. */
  protected getMiddleware(): MiddlewareRoutingItem | undefined {
    const manifest = this.getMiddlewareManifest()
    const middleware = manifest?.middleware?.['/']
    if (!middleware) {
      return
    }

    return {
      match: getMiddlewareMatcher(middleware),
      page: '/',
    }
  }

  protected getEdgeFunctionsPages(): string[] {
    const manifest = this.getMiddlewareManifest()
    if (!manifest) {
      return []
    }

    return Object.keys(manifest.functions)
  }

  /**
   * Get information for the edge function located in the provided page
   * folder. If the edge function info can't be found it will throw
   * an error.
   */
  protected getEdgeFunctionInfo(params: {
    page: string
    /** Whether we should look for a middleware or not */
    middleware: boolean
  }): {
    name: string
    paths: string[]
    env: string[]
    wasm: { filePath: string; name: string }[]
    assets: { filePath: string; name: string }[]
  } | null {
    const manifest = this.getMiddlewareManifest()
    if (!manifest) {
      return null
    }

    let foundPage: string

    try {
      foundPage = denormalizePagePath(normalizePagePath(params.page))
    } catch (err) {
      return null
    }

    let pageInfo = params.middleware
      ? manifest.middleware[foundPage]
      : manifest.functions[foundPage]

    if (!pageInfo) {
      if (!params.middleware) {
        throw new PageNotFoundError(foundPage)
      }
      return null
    }

    return {
      name: pageInfo.name,
      paths: pageInfo.files.map((file) => join(this.distDir, file)),
      env: pageInfo.env ?? [],
      wasm: (pageInfo.wasm ?? []).map((binding) => ({
        ...binding,
        filePath: join(this.distDir, binding.filePath),
      })),
      assets: (pageInfo.assets ?? []).map((binding) => {
        return {
          ...binding,
          filePath: join(this.distDir, binding.filePath),
        }
      }),
    }
  }

  /**
   * Checks if a middleware exists. This method is useful for the development
   * server where we need to check the filesystem. Here we just check the
   * middleware manifest.
   */
  protected async hasMiddleware(pathname: string): Promise<boolean> {
    const info = this.getEdgeFunctionInfo({ page: pathname, middleware: true })
    return Boolean(info && info.paths.length > 0)
  }

  /**
   * A placeholder for a function to be defined in the development server.
   * It will make sure that the root middleware or an edge function has been compiled
   * so that we can run it.
   */
  protected async ensureMiddleware() {}
  protected async ensureEdgeFunction(_params: {
    page: string
    appPaths: string[] | null
  }) {}

  /**
   * This method gets all middleware matchers and execute them when the request
   * matches. It will make sure that each middleware exists and is compiled and
   * ready to be invoked. The development server will decorate it to add warns
   * and errors with rich traces.
   */
  protected async runMiddleware(params: {
    request: BaseNextRequest
    response: BaseNextResponse
    parsedUrl: ParsedUrl
    parsed: UrlWithParsedQuery
    onWarning?: (warning: Error) => void
  }) {
    // Middleware is skipped for on-demand revalidate requests
    if (
      checkIsOnDemandRevalidate(params.request, this.renderOpts.previewProps)
        .isOnDemandRevalidate
    ) {
      return { finished: false }
    }

    let url: string

    if (this.nextConfig.skipMiddlewareUrlNormalize) {
      url = getRequestMeta(params.request, '__NEXT_INIT_URL')!
    } else {
      // For middleware to "fetch" we must always provide an absolute URL
      const query = urlQueryToSearchParams(params.parsed.query).toString()
      const locale = params.parsed.query.__nextLocale

      url = `${getRequestMeta(params.request, '_protocol')}://${
        this.hostname
      }:${this.port}${locale ? `/${locale}` : ''}${params.parsed.pathname}${
        query ? `?${query}` : ''
      }`
    }

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const page: {
      name?: string
      params?: { [key: string]: string | string[] }
    } = {}

    const middleware = this.getMiddleware()
    if (!middleware) {
      return { finished: false }
    }
    if (!(await this.hasMiddleware(middleware.page))) {
      return { finished: false }
    }

    await this.ensureMiddleware()
    const middlewareInfo = this.getEdgeFunctionInfo({
      page: middleware.page,
      middleware: true,
    })

    if (!middlewareInfo) {
      throw new MiddlewareNotFoundError()
    }

    const method = (params.request.method || 'GET').toUpperCase()
    const { run } = require('./web/sandbox') as typeof import('./web/sandbox')

    const result = await run({
      distDir: this.distDir,
      name: middlewareInfo.name,
      paths: middlewareInfo.paths,
      env: middlewareInfo.env,
      edgeFunctionEntry: middlewareInfo,
      request: {
        headers: params.request.headers,
        method,
        nextConfig: {
          basePath: this.nextConfig.basePath,
          i18n: this.nextConfig.i18n,
          trailingSlash: this.nextConfig.trailingSlash,
        },
        url: url,
        page: page,
        body: getRequestMeta(params.request, '__NEXT_CLONABLE_BODY'),
      },
      useCache: true,
      onWarning: params.onWarning,
    })

    if (!this.renderOpts.dev) {
      result.waitUntil.catch((error) => {
        console.error(`Uncaught: middleware waitUntil errored`, error)
      })
    }

    if (!result) {
      this.render404(params.request, params.response, params.parsed)
      return { finished: true }
    }

    for (let [key, value] of result.response.headers) {
      if (key.toLowerCase() !== 'set-cookie') continue

      // Clear existing header.
      result.response.headers.delete(key)

      // Append each cookie individually.
      const cookies = splitCookiesString(value)
      for (const cookie of cookies) {
        result.response.headers.append(key, cookie)
      }

      // Add cookies to request meta.
      addRequestMeta(params.request, '_nextMiddlewareCookie', cookies)
    }

    return result
  }

  protected generateCatchAllMiddlewareRoute(devReady?: boolean): Route[] {
    if (this.minimalMode) return []
    const routes = []
    if (!this.renderOpts.dev || devReady) {
      if (this.getMiddleware()) {
        const middlewareCatchAllRoute: Route = {
          match: getPathMatch('/:path*'),
          matchesBasePath: true,
          matchesLocale: true,
          type: 'route',
          name: 'middleware catchall',
          fn: async (req, res, _params, parsed) => {
            const isMiddlewareInvoke =
              this.isRenderWorker && req.headers['x-middleware-invoke']

            const handleFinished = (finished: boolean = false) => {
              if (isMiddlewareInvoke && !finished) {
                res.setHeader('x-middleware-invoke', '1')
                res.body('').send()
                return { finished: true }
              }
              return { finished }
            }

            if (this.isRenderWorker && !isMiddlewareInvoke) {
              return { finished: false }
            }

            const middleware = this.getMiddleware()
            if (!middleware) {
              return handleFinished()
            }

            const initUrl = getRequestMeta(req, '__NEXT_INIT_URL')!
            const parsedUrl = parseUrl(initUrl)
            const pathnameInfo = getNextPathnameInfo(parsedUrl.pathname, {
              nextConfig: this.nextConfig,
              i18nProvider: this.i18nProvider,
            })

            parsedUrl.pathname = pathnameInfo.pathname
            const normalizedPathname = removeTrailingSlash(
              parsed.pathname || ''
            )
            if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
              return handleFinished()
            }

            let result: Awaited<
              ReturnType<typeof NextNodeServer.prototype.runMiddleware>
            >

            try {
              await this.ensureMiddleware()

              if (this.isRouterWorker && this.renderWorkers?.middleware) {
                if (this.renderWorkersPromises) {
                  await this.renderWorkersPromises
                  this.renderWorkersPromises = undefined
                }

                const { port, hostname } =
                  await this.renderWorkers.middleware.initialize(
                    this.renderWorkerOpts!
                  )
                const renderUrl = new URL(initUrl)
                renderUrl.hostname = hostname
                renderUrl.port = port + ''

                const invokeHeaders: typeof req.headers = {
                  ...req.headers,
                  'x-invoke-path': '',
                  'x-invoke-query': '',
                  'x-middleware-invoke': '1',
                }
                const invokeRes = await invokeRequest(
                  renderUrl.toString(),
                  {
                    headers: invokeHeaders,
                    method: req.method,
                  },
                  getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
                )
                const webResponse = new Response(null, {
                  status: invokeRes.statusCode,
                  headers: new Headers(invokeRes.headers as HeadersInit),
                })

                ;(webResponse as any).invokeRes = invokeRes

                result = {
                  response: webResponse,
                  waitUntil: Promise.resolve(),
                }
                for (const key of [...result.response.headers.keys()]) {
                  if (
                    [
                      'content-encoding',
                      'transfer-encoding',
                      'keep-alive',
                      'connection',
                    ].includes(key)
                  ) {
                    result.response.headers.delete(key)
                  } else {
                    const value = result.response.headers.get(key)
                    // propagate this to req headers so it's
                    // passed to the render worker for the page
                    req.headers[key] = value || undefined

                    if (key.toLowerCase() === 'set-cookie' && value) {
                      addRequestMeta(
                        req,
                        '_nextMiddlewareCookie',
                        splitCookiesString(value)
                      )
                    }
                  }
                }
              } else {
                result = await this.runMiddleware({
                  request: req,
                  response: res,
                  parsedUrl: parsedUrl,
                  parsed: parsed,
                })

                if (isMiddlewareInvoke && 'response' in result) {
                  for (const [key, value] of Object.entries(
                    toNodeHeaders(result.response.headers)
                  )) {
                    if (key !== 'content-encoding' && value !== undefined) {
                      res.setHeader(key, value as string | string[])
                    }
                  }
                  res.statusCode = result.response.status
                  for await (const chunk of result.response.body ||
                    ([] as any)) {
                    this.streamResponseChunk(res as NodeNextResponse, chunk)
                  }
                  res.send()
                  return {
                    finished: true,
                  }
                }
              }
            } catch (err) {
              if (isError(err) && err.code === 'ENOENT') {
                await this.render404(req, res, parsed)
                return { finished: true }
              }

              if (err instanceof DecodeError) {
                res.statusCode = 400
                this.renderError(err, req, res, parsed.pathname || '')
                return { finished: true }
              }

              const error = getProperError(err)
              console.error(error)
              res.statusCode = 500
              this.renderError(error, req, res, parsed.pathname || '')
              return { finished: true }
            }

            if ('finished' in result) {
              return result
            }

            if (result.response.headers.has('x-middleware-rewrite')) {
              const value = result.response.headers.get('x-middleware-rewrite')!
              const rel = relativizeURL(value, initUrl)
              result.response.headers.set('x-middleware-rewrite', rel)
            }

            if (result.response.headers.has('x-middleware-override-headers')) {
              const overriddenHeaders: Set<string> = new Set()
              for (const key of result.response.headers
                .get('x-middleware-override-headers')!
                .split(',')) {
                overriddenHeaders.add(key.trim())
              }

              result.response.headers.delete('x-middleware-override-headers')

              // Delete headers.
              for (const key of Object.keys(req.headers)) {
                if (!overriddenHeaders.has(key)) {
                  delete req.headers[key]
                }
              }

              // Update or add headers.
              for (const key of overriddenHeaders.keys()) {
                const valueKey = 'x-middleware-request-' + key
                const newValue = result.response.headers.get(valueKey)
                const oldValue = req.headers[key]

                if (oldValue !== newValue) {
                  req.headers[key] = newValue === null ? undefined : newValue
                }

                result.response.headers.delete(valueKey)
              }
            }

            if (result.response.headers.has('Location')) {
              const value = result.response.headers.get('Location')!
              const rel = relativizeURL(value, initUrl)
              result.response.headers.set('Location', rel)
            }

            if (
              !result.response.headers.has('x-middleware-rewrite') &&
              !result.response.headers.has('x-middleware-next') &&
              !result.response.headers.has('Location')
            ) {
              result.response.headers.set('x-middleware-refresh', '1')
            }

            result.response.headers.delete('x-middleware-next')

            for (const [key, value] of Object.entries(
              toNodeHeaders(result.response.headers)
            )) {
              if (
                [
                  'x-middleware-rewrite',
                  'x-middleware-redirect',
                  'x-middleware-refresh',
                ].includes(key)
              ) {
                continue
              }
              if (key !== 'content-encoding' && value !== undefined) {
                if (typeof value === 'number') {
                  res.setHeader(key, value.toString())
                } else {
                  res.setHeader(key, value)
                }
              }
            }

            res.statusCode = result.response.status
            res.statusMessage = result.response.statusText

            const location = result.response.headers.get('Location')
            if (location) {
              res.statusCode = result.response.status
              if (res.statusCode === 308) {
                res.setHeader('Refresh', `0;url=${location}`)
              }

              res.body(location).send()
              return {
                finished: true,
              }
            }

            // If the middleware has set a `x-middleware-rewrite` header, we
            // need to rewrite the URL to the new path and re-run the request.
            if (result.response.headers.has('x-middleware-rewrite')) {
              const rewritePath = result.response.headers.get(
                'x-middleware-rewrite'
              )!
              const parsedDestination = parseUrl(rewritePath)
              const newUrl = parsedDestination.pathname

              // If the destination has a protocol and host that doesn't match
              // the current request, we need to proxy the request to the
              // correct host.
              if (
                parsedDestination.protocol &&
                (parsedDestination.port
                  ? `${parsedDestination.hostname}:${parsedDestination.port}`
                  : parsedDestination.hostname) !== req.headers.host
              ) {
                return this.proxyRequest(
                  req as NodeNextRequest,
                  res as NodeNextResponse,
                  parsedDestination
                )
              }

              // If this server has i18n enabled, we need to make sure to parse
              // the locale from the destination URL and add it to the query
              // string so that the next request is properly localized.
              if (this.i18nProvider) {
                const { detectedLocale } = this.i18nProvider.analyze(newUrl)
                if (detectedLocale) {
                  parsedDestination.query.__nextLocale = detectedLocale
                }
              }

              addRequestMeta(req, '_nextRewroteUrl', newUrl)
              addRequestMeta(req, '_nextDidRewrite', newUrl !== req.url)

              if (!isMiddlewareInvoke) {
                return {
                  finished: false,
                  pathname: newUrl,
                  query: parsedDestination.query,
                }
              }
            }

            if (result.response.headers.has('x-middleware-refresh')) {
              res.statusCode = result.response.status

              if ((result.response as any).invokeRes) {
                for await (const chunk of (result.response as any).invokeRes) {
                  this.streamResponseChunk(res as NodeNextResponse, chunk)
                }
                ;(res as NodeNextResponse).originalResponse.end()
              } else {
                for await (const chunk of result.response.body || ([] as any)) {
                  this.streamResponseChunk(res as NodeNextResponse, chunk)
                }
                res.send()
              }
              return {
                finished: true,
              }
            }

            return {
              finished: false,
            }
          },
        }

        routes.push(middlewareCatchAllRoute)
      }
    }

    return routes
  }

  private _cachedPreviewManifest: PrerenderManifest | undefined
  protected getPrerenderManifest(): PrerenderManifest {
    if (this._cachedPreviewManifest) {
      return this._cachedPreviewManifest
    }
    if (
      this.renderOpts?.dev ||
      this.serverOptions?.dev ||
      this.renderWorkerOpts?.dev ||
      process.env.NODE_ENV === 'development' ||
      process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD
    ) {
      this._cachedPreviewManifest = {
        version: 4,
        routes: {},
        dynamicRoutes: {},
        notFoundRoutes: [],
        preview: {
          previewModeId: require('crypto').randomBytes(16).toString('hex'),
          previewModeSigningKey: require('crypto')
            .randomBytes(32)
            .toString('hex'),
          previewModeEncryptionKey: require('crypto')
            .randomBytes(32)
            .toString('hex'),
        },
      }
      return this._cachedPreviewManifest
    }
    const manifest = require(join(this.distDir, PRERENDER_MANIFEST))
    return (this._cachedPreviewManifest = manifest)
  }

  protected getRoutesManifest() {
    return getTracer().trace(NextNodeServerSpan.getRoutesManifest, () =>
      require(join(this.distDir, ROUTES_MANIFEST))
    )
  }

  protected attachRequestMeta(
    req: BaseNextRequest,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    const protocol = (
      (req as NodeNextRequest).originalRequest?.socket as TLSSocket
    )?.encrypted
      ? 'https'
      : 'http'

    // When there are hostname and port we build an absolute URL
    const initUrl =
      this.hostname && this.port
        ? `${protocol}://${this.hostname}:${this.port}${req.url}`
        : (this.nextConfig.experimental as any).trustHostHeader
        ? `https://${req.headers.host || 'localhost'}${req.url}`
        : req.url

    addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
    addRequestMeta(req, '_protocol', protocol)
    addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req.body))
  }

  protected async runEdgeFunction(params: {
    req: BaseNextRequest | NodeNextRequest
    res: BaseNextResponse | NodeNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
    appPaths: string[] | null
    match?: RouteMatch
    onWarning?: (warning: Error) => void
  }): Promise<FetchEventResult | null> {
    let edgeInfo: ReturnType<typeof this.getEdgeFunctionInfo> | undefined

    const { query, page, match } = params

    if (!match)
      await this.ensureEdgeFunction({ page, appPaths: params.appPaths })
    edgeInfo = this.getEdgeFunctionInfo({
      page,
      middleware: false,
    })

    if (!edgeInfo) {
      return null
    }

    // For edge to "fetch" we must always provide an absolute URL
    const isDataReq = !!query.__nextDataReq
    const initialUrl = new URL(
      getRequestMeta(params.req, '__NEXT_INIT_URL') || '/',
      'http://n'
    )
    const queryString = urlQueryToSearchParams({
      ...Object.fromEntries(initialUrl.searchParams),
      ...query,
      ...params.params,
    }).toString()

    if (isDataReq) {
      params.req.headers['x-nextjs-data'] = '1'
    }
    initialUrl.search = queryString
    const url = initialUrl.toString()

    if (!url.startsWith('http')) {
      throw new Error(
        'To use middleware you must provide a `hostname` and `port` to the Next.js Server'
      )
    }

    const { run } = require('./web/sandbox') as typeof import('./web/sandbox')
    const result = await run({
      distDir: this.distDir,
      name: edgeInfo.name,
      paths: edgeInfo.paths,
      env: edgeInfo.env,
      edgeFunctionEntry: edgeInfo,
      request: {
        headers: params.req.headers,
        method: params.req.method,
        nextConfig: {
          basePath: this.nextConfig.basePath,
          i18n: this.nextConfig.i18n,
          trailingSlash: this.nextConfig.trailingSlash,
        },
        url,
        page: {
          name: params.page,
          ...(params.params && { params: params.params }),
        },
        body: getRequestMeta(params.req, '__NEXT_CLONABLE_BODY'),
      },
      useCache: true,
      onWarning: params.onWarning,
      incrementalCache:
        (globalThis as any).__incrementalCache ||
        getRequestMeta(params.req, '_nextIncrementalCache'),
    })

    params.res.statusCode = result.response.status
    params.res.statusMessage = result.response.statusText

    // TODO: (wyattjoh) investigate improving this

    result.response.headers.forEach((value, key) => {
      // The append handling is special cased for `set-cookie`.
      if (key.toLowerCase() === 'set-cookie') {
        // TODO: (wyattjoh) replace with native response iteration when we can upgrade undici
        for (const cookie of splitCookiesString(value)) {
          params.res.appendHeader(key, cookie)
        }
      } else {
        params.res.appendHeader(key, value)
      }
    })

    if (result.response.body) {
      // TODO(gal): not sure that we always need to stream
      const nodeResStream = (params.res as NodeNextResponse).originalResponse
      const { consumeUint8ArrayReadableStream } =
        require('next/dist/compiled/edge-runtime') as typeof import('next/dist/compiled/edge-runtime')
      try {
        for await (const chunk of consumeUint8ArrayReadableStream(
          result.response.body
        )) {
          nodeResStream.write(chunk)
        }
      } finally {
        nodeResStream.end()
      }
    } else {
      ;(params.res as NodeNextResponse).originalResponse.end()
    }

    return result
  }

  protected get serverDistDir() {
    return join(this.distDir, SERVER_DIRECTORY)
  }
}
