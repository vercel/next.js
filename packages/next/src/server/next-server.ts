import './node-environment'
import './require-hook'
import './node-polyfill-crypto'

import type { CacheFs } from '../shared/lib/utils'
import {
  DecodeError,
  PageNotFoundError,
  MiddlewareNotFoundError,
} from '../shared/lib/utils'
import type { MiddlewareManifest } from '../build/webpack/plugins/middleware-plugin'
import type RenderResult from './render-result'
import type { FetchEventResult } from './web/types'
import type { PrerenderManifest } from '../build'
import type { FetchMetric } from './base-http'
import type { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import type { Params } from '../shared/lib/router/utils/route-matcher'
import type { MiddlewareRouteMatch } from '../shared/lib/router/utils/middleware-route-matcher'
import type { RouteMatch } from './route-matches/route-match'
import type { IncomingMessage, ServerResponse } from 'http'
import type { PagesAPIRouteModule } from './route-modules/pages-api/module'
import type { UrlWithParsedQuery } from 'url'
import type { ParsedUrlQuery } from 'querystring'
import type { ParsedUrl } from '../shared/lib/router/utils/parse-url'
import type { Revalidate, SwrDelta } from './lib/revalidate'

import fs from 'fs'
import { join, resolve } from 'path'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { addRequestMeta, getRequestMeta } from './request-meta'
import {
  PAGES_MANIFEST,
  BUILD_ID_FILE,
  MIDDLEWARE_MANIFEST,
  PRERENDER_MANIFEST,
  ROUTES_MANIFEST,
  CLIENT_PUBLIC_FILES_PATH,
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
  NEXT_FONT_MANIFEST,
  PHASE_PRODUCTION_BUILD,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../shared/lib/constants'
import { findDir } from '../lib/find-pages-dir'
import { NodeNextRequest, NodeNextResponse } from './base-http/node'
import { sendRenderResult } from './send-payload'
import { parseUrl } from '../shared/lib/router/utils/parse-url'
import * as Log from '../build/output/log'

import type {
  Options,
  FindComponentsResult,
  MiddlewareRoutingItem,
  RequestContext,
  NormalizedRouteManifest,
  LoadedRenderOpts,
  RouteHandler,
  NextEnabledDirectories,
  BaseRequestHandler,
} from './base-server'
import BaseServer, { NoFallbackError } from './base-server'
import { getMaybePagePath, getPagePath, requireFontManifest } from './require'
import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { loadComponents } from './load-components'
import type { LoadComponentsReturnType } from './load-components'
import isError, { getProperError } from '../lib/is-error'
import type { FontManifest } from './font-utils'
import { splitCookiesString, toNodeOutgoingHttpHeaders } from './web/utils'
import { getMiddlewareRouteMatcher } from '../shared/lib/router/utils/middleware-route-matcher'
import { loadEnvConfig } from '@next/env'
import { urlQueryToSearchParams } from '../shared/lib/router/utils/querystring'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import { getCloneableBody } from './body-streams'
import { checkIsOnDemandRevalidate } from './api-utils'
import ResponseCache from './response-cache'
import { IncrementalCache } from './lib/incremental-cache'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

import { setHttpClientAndAgentOptions } from './setup-http-agent-env'

import { isPagesAPIRouteMatch } from './route-matches/pages-api-route-match'
import type { PagesAPIRouteMatch } from './route-matches/pages-api-route-match'
import type { MatchOptions } from './route-matcher-managers/route-matcher-manager'
import {
  INSTRUMENTATION_HOOK_FILENAME,
  RSC_PREFETCH_SUFFIX,
} from '../lib/constants'
import { BubbledError, getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import { nodeFs } from './lib/node-fs-methods'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { pipeToNodeResponse } from './pipe-readable'
import { createRequestResponseMocks } from './lib/mock-request'
import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'
import { signalFromNodeResponse } from './web/spec-extension/adapters/next-request'
import { RouteModuleLoader } from './lib/module-loader/route-module-loader'
import { loadManifest } from './load-manifest'
import { lazyRenderAppPage } from './route-modules/app-page/module.render'
import { lazyRenderPagesPage } from './route-modules/pages/module.render'
import { interopDefault } from '../lib/interop-default'
import { formatDynamicImportPath } from '../lib/format-dynamic-import-path'
import type { NextFontManifest } from '../build/webpack/plugins/next-font-manifest-plugin'
import { isInterceptionRouteRewrite } from '../lib/generate-interception-routes-rewrites'
import { stripNextRscUnionQuery } from '../lib/url'

export * from './base-server'

declare const __non_webpack_require__: NodeRequire

// For module that can be both CJS or ESM
const dynamicImportEsmDefault = process.env.NEXT_MINIMAL
  ? (id: string) =>
      import(/* webpackIgnore: true */ id).then((mod) => mod.default || mod)
  : (id: string) => import(id).then((mod) => mod.default || mod)

// For module that will be compiled to CJS, e.g. instrument
const dynamicRequire = process.env.NEXT_MINIMAL
  ? __non_webpack_require__
  : require

function writeStdoutLine(text: string) {
  process.stdout.write(' ' + text + '\n')
}

function formatRequestUrl(url: string, maxLength: number | undefined) {
  return maxLength !== undefined && url.length > maxLength
    ? url.substring(0, maxLength) + '..'
    : url
}

export type NodeRequestHandler = BaseRequestHandler<
  IncomingMessage | NodeNextRequest,
  ServerResponse | NodeNextResponse
>

type NodeRouteHandler = RouteHandler<NodeNextRequest, NodeNextResponse>

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

export default class NextNodeServer extends BaseServer<
  Options,
  NodeNextRequest,
  NodeNextResponse
> {
  protected middlewareManifestPath: string
  private _serverDistDir: string | undefined
  private imageResponseCache?: ResponseCache
  protected renderWorkersPromises?: Promise<void>
  protected dynamicRoutes?: {
    match: import('../shared/lib/router/utils/route-matcher').RouteMatchFn
    page: string
    re: RegExp
  }[]
  private routerServerHandler?: (
    req: IncomingMessage,
    res: ServerResponse
  ) => void

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
    process.env.NEXT_DEPLOYMENT_ID = this.nextConfig.deploymentId || ''

    if (!this.minimalMode) {
      this.imageResponseCache = new ResponseCache(this.minimalMode)
    }

    const { appDocumentPreloading } = this.nextConfig.experimental
    const isDefaultEnabled = typeof appDocumentPreloading === 'undefined'

    if (
      !options.dev &&
      (appDocumentPreloading === true ||
        !(this.minimalMode && isDefaultEnabled))
    ) {
      // pre-warm _document and _app as these will be
      // needed for most requests
      loadComponents({
        distDir: this.distDir,
        page: '/_document',
        isAppPath: false,
      }).catch(() => {})
      loadComponents({
        distDir: this.distDir,
        page: '/_app',
        isAppPath: false,
      }).catch(() => {})
    }

    if (
      !options.dev &&
      !this.minimalMode &&
      this.nextConfig.experimental.preloadEntriesOnStart
    ) {
      this.unstable_preloadEntries()
    }

    if (!options.dev) {
      const { dynamicRoutes = [] } = this.getRoutesManifest() ?? {}
      this.dynamicRoutes = dynamicRoutes.map((r) => {
        // TODO: can we just re-use the regex from the manifest?
        const regex = getRouteRegex(r.page)
        const match = getRouteMatcher(regex)

        return {
          match,
          page: r.page,
          re: regex.re,
        }
      })
    }

    // ensure options are set when loadConfig isn't called
    setHttpClientAndAgentOptions(this.nextConfig)

    // Intercept fetch and other testmode apis.
    if (this.serverOptions.experimentalTestProxy) {
      process.env.NEXT_PRIVATE_TEST_PROXY = 'true'
      const {
        interceptTestApis,
      } = require('next/dist/experimental/testmode/server')
      interceptTestApis()
    }

    this.middlewareManifestPath = join(this.serverDistDir, MIDDLEWARE_MANIFEST)

    // This is just optimization to fire prepare as soon as possible. It will be
    // properly awaited later. We add the catch here to ensure that it does not
    // cause a unhandled promise rejection. The promise rejection will be
    // handled later on via the `await` when the request handler is called.
    if (!options.dev) {
      this.prepare().catch((err) => {
        console.error('Failed to prepare server', err)
      })
    }
  }

  public async unstable_preloadEntries(): Promise<void> {
    const appPathsManifest = this.getAppPathsManifest()
    const pagesManifest = this.getPagesManifest()

    for (const page of Object.keys(pagesManifest || {})) {
      await loadComponents({
        distDir: this.distDir,
        page,
        isAppPath: false,
      }).catch(() => {})
    }

    for (const page of Object.keys(appPathsManifest || {})) {
      await loadComponents({ distDir: this.distDir, page, isAppPath: true })
        .then(async ({ ComponentMod }) => {
          const webpackRequire = ComponentMod.__next_app__.require
          if (webpackRequire?.m) {
            for (const id of Object.keys(webpackRequire.m)) {
              await webpackRequire(id)
            }
          }
        })
        .catch(() => {})
    }
  }

  protected async handleUpgrade(): Promise<void> {
    // The web server does not support web sockets, it's only used for HMR in
    // development.
  }

  protected async loadInstrumentationModule() {
    let instrumentationModule: any
    if (
      !this.serverOptions.dev &&
      this.nextConfig.experimental.instrumentationHook
    ) {
      try {
        instrumentationModule = await dynamicRequire(
          resolve(
            this.serverOptions.dir || '.',
            this.serverOptions.conf.distDir!,
            'server',
            INSTRUMENTATION_HOOK_FILENAME
          )
        )
      } catch (err: any) {
        if (err.code !== 'MODULE_NOT_FOUND') {
          err.message = `An error occurred while loading instrumentation hook: ${err.message}`
          throw err
        }
      }
    }
    return instrumentationModule
  }

  protected async prepareImpl() {
    await super.prepareImpl()

    // Call the instrumentation register hook
    const instrumentation = await this.loadInstrumentationModule()
    if (instrumentation) {
      await instrumentation.register?.()
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

  protected async getIncrementalCache({
    requestHeaders,
    requestProtocol,
  }: {
    requestHeaders: IncrementalCache['requestHeaders']
    requestProtocol: 'http' | 'https'
  }) {
    const dev = !!this.renderOpts.dev
    let CacheHandler: any
    const { cacheHandler } = this.nextConfig

    if (cacheHandler) {
      CacheHandler = interopDefault(
        await dynamicImportEsmDefault(
          formatDynamicImportPath(this.distDir, cacheHandler)
        )
      )
    }

    // incremental-cache is request specific
    // although can have shared caches in module scope
    // per-cache handler
    return new IncrementalCache({
      fs: this.getCacheFilesystem(),
      dev,
      requestHeaders,
      requestProtocol,
      pagesDir: this.enabledDirectories.pages,
      appDir: this.enabledDirectories.app,
      allowedRevalidateHeaderKeys:
        this.nextConfig.experimental.allowedRevalidateHeaderKeys,
      minimalMode: this.minimalMode,
      serverDistDir: this.serverDistDir,
      fetchCache: true,
      fetchCacheKeyPrefix: this.nextConfig.experimental.fetchCacheKeyPrefix,
      maxMemoryCacheSize: this.nextConfig.cacheMaxMemorySize,
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
    return loadManifest(
      join(this.serverDistDir, PAGES_MANIFEST)
    ) as PagesManifest
  }

  protected getAppPathsManifest(): PagesManifest | undefined {
    if (!this.enabledDirectories.app) return undefined

    return loadManifest(
      join(this.serverDistDir, APP_PATHS_MANIFEST)
    ) as PagesManifest
  }

  protected getinterceptionRoutePatterns(): RegExp[] {
    if (!this.enabledDirectories.app) return []

    const routesManifest = this.getRoutesManifest()
    return (
      routesManifest?.rewrites.beforeFiles
        .filter(isInterceptionRouteRewrite)
        .map((rewrite) => new RegExp(rewrite.regex)) ?? []
    )
  }

  protected async hasPage(pathname: string): Promise<boolean> {
    return !!getMaybePagePath(
      pathname,
      this.distDir,
      this.nextConfig.i18n?.locales,
      this.enabledDirectories.app
    )
  }

  protected getBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `Could not find a production build in the '${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id`
        )
      }

      throw err
    }
  }

  protected getEnabledDirectories(dev: boolean): NextEnabledDirectories {
    const dir = dev ? this.dir : this.serverDistDir

    return {
      app: findDir(dir, 'app') ? true : false,
      pages: findDir(dir, 'pages') ? true : false,
    }
  }

  protected sendRenderResult(
    req: NodeNextRequest,
    res: NodeNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      revalidate: Revalidate | undefined
      swrDelta: SwrDelta | undefined
    }
  ): Promise<void> {
    return sendRenderResult({
      req: req.originalRequest,
      res: res.originalResponse,
      result: options.result,
      type: options.type,
      generateEtags: options.generateEtags,
      poweredByHeader: options.poweredByHeader,
      revalidate: options.revalidate,
      swrDelta: options.swrDelta,
    })
  }

  protected async runApi(
    req: NodeNextRequest,
    res: NodeNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    const edgeFunctionsPages = this.getEdgeFunctionsPages()

    for (const edgeFunctionsPage of edgeFunctionsPages) {
      if (edgeFunctionsPage === match.definition.pathname) {
        const handledAsEdgeFunction = await this.runEdgeFunction({
          req,
          res,
          query,
          params: match.params,
          page: match.definition.pathname,
          appPaths: null,
        })

        if (handledAsEdgeFunction) {
          return true
        }
      }
    }

    // The module supports minimal mode, load the minimal module.
    const module = await RouteModuleLoader.load<PagesAPIRouteModule>(
      match.definition.filename
    )

    query = { ...query, ...match.params }

    delete query.__nextLocale
    delete query.__nextDefaultLocale
    delete query.__nextInferredLocaleFromDefault

    await module.render(req.originalRequest, res.originalResponse, {
      previewProps: this.renderOpts.previewProps,
      revalidate: this.revalidate.bind(this),
      trustHostHeader: this.nextConfig.experimental.trustHostHeader,
      allowedRevalidateHeaderKeys:
        this.nextConfig.experimental.allowedRevalidateHeaderKeys,
      hostname: this.fetchHostname,
      minimalMode: this.minimalMode,
      dev: this.renderOpts.dev === true,
      query,
      params: match.params,
      page: match.definition.pathname,
    })

    return true
  }

  protected async renderHTML(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: LoadedRenderOpts
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
    renderOpts: LoadedRenderOpts
  ): Promise<RenderResult> {
    if (process.env.NEXT_MINIMAL) {
      throw new Error(
        'Invariant: renderHTML should not be called in minimal mode'
      )
      // the `else` branch is needed for tree-shaking
    } else {
      // Due to the way we pass data by mutating `renderOpts`, we can't extend the
      // object here but only updating its `nextFontManifest` field.
      // https://github.com/vercel/next.js/blob/df7cbd904c3bd85f399d1ce90680c0ecf92d2752/packages/next/server/render.tsx#L947-L952
      renderOpts.nextFontManifest = this.nextFontManifest

      if (this.enabledDirectories.app && renderOpts.isAppPath) {
        return lazyRenderAppPage(req, res, pathname, query, renderOpts)
      }

      // TODO: re-enable this once we've refactored to use implicit matches
      // throw new Error('Invariant: render should have used routeModule')

      return lazyRenderPagesPage(
        req.originalRequest,
        res.originalResponse,
        pathname,
        query,
        renderOpts
      )
    }
  }

  protected async imageOptimizer(
    req: NodeNextRequest,
    res: NodeNextResponse,
    paramsResult: import('./image-optimizer').ImageParamsResult
  ): Promise<{ buffer: Buffer; contentType: string; maxAge: number }> {
    if (process.env.NEXT_MINIMAL) {
      throw new Error(
        'invariant: imageOptimizer should not be called in minimal mode'
      )
    } else {
      const { imageOptimizer, fetchExternalImage, fetchInternalImage } =
        require('./image-optimizer') as typeof import('./image-optimizer')

      const handleInternalReq = async (
        newReq: IncomingMessage,
        newRes: ServerResponse
      ) => {
        if (newReq.url === req.url) {
          throw new Error(`Invariant attempted to optimize _next/image itself`)
        }

        if (!this.routerServerHandler) {
          throw new Error(`Invariant missing routerServerHandler`)
        }

        await this.routerServerHandler(newReq, newRes)
        return
      }

      const { isAbsolute, href } = paramsResult

      const imageUpstream = isAbsolute
        ? await fetchExternalImage(href)
        : await fetchInternalImage(
            href,
            req.originalRequest,
            res.originalResponse,
            handleInternalReq
          )

      return imageOptimizer(
        imageUpstream,
        paramsResult,
        this.nextConfig,
        this.renderOpts.dev
      )
    }
  }

  protected getPagePath(pathname: string, locales?: string[]): string {
    return getPagePath(
      pathname,
      this.distDir,
      locales,
      this.enabledDirectories.app
    )
  }

  protected async renderPageComponent(
    ctx: RequestContext<NodeNextRequest, NodeNextResponse>,
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
    page,
    query,
    params,
    isAppPath,
    url,
  }: {
    page: string
    query: NextParsedUrlQuery
    params: Params
    isAppPath: boolean
    // The following parameters are used in the development server's
    // implementation.
    sriEnabled?: boolean
    appPaths?: ReadonlyArray<string> | null
    shouldEnsure: boolean
    url?: string
  }): Promise<FindComponentsResult | null> {
    return getTracer().trace(
      NextNodeServerSpan.findPageComponents,
      {
        spanName: 'resolve page components',
        attributes: {
          'next.route': isAppPath ? normalizeAppPath(page) : page,
        },
      },
      () =>
        this.findPageComponentsImpl({
          page,
          query,
          params,
          isAppPath,
          url,
        })
    )
  }

  private async findPageComponentsImpl({
    page,
    query,
    params,
    isAppPath,
    url: _url,
  }: {
    page: string
    query: NextParsedUrlQuery
    params: Params
    isAppPath: boolean
    url?: string
  }): Promise<FindComponentsResult | null> {
    const pagePaths: string[] = [page]
    if (query.amp) {
      // try serving a static AMP version first
      pagePaths.unshift(
        (isAppPath ? normalizeAppPath(page) : normalizePagePath(page)) + '.amp'
      )
    }

    if (query.__nextLocale) {
      pagePaths.unshift(
        ...pagePaths.map(
          (path) => `/${query.__nextLocale}${path === '/' ? '' : path}`
        )
      )
    }

    for (const pagePath of pagePaths) {
      try {
        const components = await loadComponents({
          distDir: this.distDir,
          page: pagePath,
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
            ...(!this.renderOpts.isExperimentalCompile &&
            components.getStaticProps
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

  protected getNextFontManifest(): NextFontManifest | undefined {
    return loadManifest(
      join(this.distDir, 'server', NEXT_FONT_MANIFEST + '.json')
    ) as NextFontManifest
  }

  protected getFallback(page: string): Promise<string> {
    page = normalizePagePath(page)
    const cacheFs = this.getCacheFilesystem()
    return cacheFs.readFile(
      join(this.serverDistDir, 'pages', `${page}.html`),
      'utf8'
    )
  }

  protected handleNextImageRequest: NodeRouteHandler = async (
    req,
    res,
    parsedUrl
  ) => {
    if (!parsedUrl.pathname || !parsedUrl.pathname.startsWith('/_next/image')) {
      return false
    }

    if (
      this.minimalMode ||
      this.nextConfig.output === 'export' ||
      process.env.NEXT_MINIMAL
    ) {
      res.statusCode = 400
      res.body('Bad Request').send()
      return true
      // the `else` branch is needed for tree-shaking
    } else {
      const { ImageOptimizerCache } =
        require('./image-optimizer') as typeof import('./image-optimizer')

      const imageOptimizerCache = new ImageOptimizerCache({
        distDir: this.distDir,
        nextConfig: this.nextConfig,
      })

      const { getHash, sendResponse, ImageError } =
        require('./image-optimizer') as typeof import('./image-optimizer')

      if (!this.imageResponseCache) {
        throw new Error('invariant image optimizer cache was not initialized')
      }
      const imagesConfig = this.nextConfig.images

      if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
        await this.render404(req, res)
        return true
      }

      const paramsResult = ImageOptimizerCache.validateParams(
        req.originalRequest,
        parsedUrl.query,
        this.nextConfig,
        !!this.renderOpts.dev
      )

      if ('errorMessage' in paramsResult) {
        res.statusCode = 400
        res.body(paramsResult.errorMessage).send()
        return true
      }

      const cacheKey = ImageOptimizerCache.getCacheKey(paramsResult)

      try {
        const { getExtension } =
          require('./serve-static') as typeof import('./serve-static')
        const cacheEntry = await this.imageResponseCache.get(
          cacheKey,
          async () => {
            const { buffer, contentType, maxAge } = await this.imageOptimizer(
              req,
              res,
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
          req.originalRequest,
          res.originalResponse,
          paramsResult.href,
          cacheEntry.value.extension,
          cacheEntry.value.buffer,
          paramsResult.isStatic,
          cacheEntry.isMiss ? 'MISS' : cacheEntry.isStale ? 'STALE' : 'HIT',
          imagesConfig,
          cacheEntry.revalidate || 0,
          Boolean(this.renderOpts.dev)
        )
        return true
      } catch (err) {
        if (err instanceof ImageError) {
          res.statusCode = err.statusCode
          res.body(err.message).send()
          return true
        }
        throw err
      }
    }
  }

  protected handleCatchallRenderRequest: NodeRouteHandler = async (
    req,
    res,
    parsedUrl
  ) => {
    let { pathname, query } = parsedUrl
    if (!pathname) {
      throw new Error('Invariant: pathname is undefined')
    }

    // This is a catch-all route, there should be no fallbacks so mark it as
    // such.
    query._nextBubbleNoFallback = '1'

    try {
      // next.js core assumes page path without trailing slash
      pathname = removeTrailingSlash(pathname)

      const options: MatchOptions = {
        i18n: this.i18nProvider?.fromQuery(pathname, query),
      }
      const match = await this.matchers.match(pathname, options)

      // If we don't have a match, try to render it anyways.
      if (!match) {
        await this.render(req, res, pathname, query, parsedUrl, true)

        return true
      }

      // Add the match to the request so we don't have to re-run the matcher
      // for the same request.
      addRequestMeta(req, 'match', match)

      // TODO-APP: move this to a route handler
      const edgeFunctionsPages = this.getEdgeFunctionsPages()
      for (const edgeFunctionsPage of edgeFunctionsPages) {
        // If the page doesn't match the edge function page, skip it.
        if (edgeFunctionsPage !== match.definition.page) continue

        if (this.nextConfig.output === 'export') {
          await this.render404(req, res, parsedUrl)
          return true
        }
        delete query._nextBubbleNoFallback
        delete query[NEXT_RSC_UNION_QUERY]

        const handled = await this.runEdgeFunction({
          req,
          res,
          query,
          params: match.params,
          page: match.definition.page,
          match,
          appPaths: null,
        })

        // If we handled the request, we can return early.
        if (handled) return true
      }

      // If the route was detected as being a Pages API route, then handle
      // it.
      // TODO: move this behavior into a route handler.
      if (isPagesAPIRouteMatch(match)) {
        if (this.nextConfig.output === 'export') {
          await this.render404(req, res, parsedUrl)
          return true
        }

        delete query._nextBubbleNoFallback

        const handled = await this.handleApiRequest(req, res, query, match)
        if (handled) return true
      }

      await this.render(req, res, pathname, query, parsedUrl, true)

      return true
    } catch (err: any) {
      if (err instanceof NoFallbackError) {
        throw err
      }

      try {
        if (this.renderOpts.dev) {
          const { formatServerError } =
            require('../lib/format-server-error') as typeof import('../lib/format-server-error')
          formatServerError(err)
          await this.logErrorWithOriginalStack(err)
        } else {
          this.logError(err)
        }
        res.statusCode = 500
        await this.renderError(err, req, res, pathname, query)
        return true
      } catch {}

      throw err
    }
  }

  // Used in development only, overloaded in next-dev-server
  protected async logErrorWithOriginalStack(
    _err?: unknown,
    _type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): Promise<void> {
    throw new Error(
      'Invariant: logErrorWithOriginalStack can only be called on the development server'
    )
  }

  // Used in development only, overloaded in next-dev-server
  protected async ensurePage(_opts: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    match?: RouteMatch
    url?: string
  }): Promise<void> {
    throw new Error(
      'Invariant: ensurePage can only be called on the development server'
    )
  }

  /**
   * Resolves `API` request, in development builds on demand
   * @param req http request
   * @param res http response
   * @param pathname path of request
   */
  protected async handleApiRequest(
    req: NodeNextRequest,
    res: NodeNextResponse,
    query: ParsedUrlQuery,
    match: PagesAPIRouteMatch
  ): Promise<boolean> {
    return this.runApi(req, res, query, match)
  }

  protected getPrefetchRsc(pathname: string): Promise<string> {
    return this.getCacheFilesystem().readFile(
      join(this.serverDistDir, 'app', `${pathname}${RSC_PREFETCH_SUFFIX}`),
      'utf8'
    )
  }

  protected getCacheFilesystem(): CacheFs {
    return nodeFs
  }

  private normalizeReq(
    req: NodeNextRequest | IncomingMessage
  ): NodeNextRequest {
    return !(req instanceof NodeNextRequest) ? new NodeNextRequest(req) : req
  }

  private normalizeRes(
    res: NodeNextResponse | ServerResponse
  ): NodeNextResponse {
    return !(res instanceof NodeNextResponse) ? new NodeNextResponse(res) : res
  }

  public getRequestHandler(): NodeRequestHandler {
    const handler = this.makeRequestHandler()
    if (this.serverOptions.experimentalTestProxy) {
      const {
        wrapRequestHandlerNode,
      } = require('next/dist/experimental/testmode/server')
      return wrapRequestHandlerNode(handler)
    }
    return handler
  }

  private makeRequestHandler(): NodeRequestHandler {
    // This is just optimization to fire prepare as soon as possible. It will be
    // properly awaited later. We add the catch here to ensure that it does not
    // cause a unhandled promise rejection. The promise rejection wil be
    // handled later on via the `await` when the request handler is called.
    this.prepare().catch((err) => {
      console.error('Failed to prepare server', err)
    })

    const handler = super.getRequestHandler()
    return (req, res, parsedUrl) => {
      const normalizedReq = this.normalizeReq(req)
      const normalizedRes = this.normalizeRes(res)

      const loggingFetchesConfig = this.nextConfig.logging?.fetches
      const enabledVerboseLogging = !!loggingFetchesConfig
      const shouldTruncateUrl = !loggingFetchesConfig?.fullUrl

      if (this.renderOpts.dev) {
        const { blue, green, yellow, red, gray, white } =
          require('../lib/picocolors') as typeof import('../lib/picocolors')

        const { originalResponse } = normalizedRes

        const reqStart = Date.now()
        const isMiddlewareRequest = getRequestMeta(req, 'middlewareInvoke')

        const reqCallback = () => {
          // we don't log for non-route requests
          const routeMatch = getRequestMeta(req).match

          if (!routeMatch || isMiddlewareRequest) return

          // NOTE: this is only attached after handle has started, this runs
          // after the response has been sent, so it should have it set.
          const isRSC = getRequestMeta(normalizedReq, 'isRSCRequest')

          const reqEnd = Date.now()
          const fetchMetrics = normalizedReq.fetchMetrics || []
          const reqDuration = reqEnd - reqStart

          const statusColor = (status?: number) => {
            if (!status || status < 200) return white
            else if (status < 300) return green
            else if (status < 400) return blue
            else if (status < 500) return yellow
            return red
          }

          const color = statusColor(res.statusCode)
          const method = req.method || 'GET'
          const requestUrl = req.url || ''
          const loggingUrl = isRSC
            ? stripNextRscUnionQuery(requestUrl)
            : requestUrl

          writeStdoutLine(
            `${method} ${loggingUrl} ${color(
              res.statusCode.toString()
            )} in ${reqDuration}ms`
          )

          if (fetchMetrics.length && enabledVerboseLogging) {
            const calcNestedLevel = (
              prevMetrics: FetchMetric[],
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
              return nestedLevel === 0 ? ' ' : ' │ '.repeat(nestedLevel)
            }

            for (let i = 0; i < fetchMetrics.length; i++) {
              const metric = fetchMetrics[i]
              let { cacheStatus, cacheReason } = metric
              let cacheReasonStr = ''

              let cacheColor
              const duration = metric.end - metric.start
              if (cacheStatus === 'hit') {
                cacheColor = green
              } else {
                cacheColor = yellow
                const status = cacheStatus === 'skip' ? 'skipped' : 'missed'
                cacheReasonStr = gray(
                  `Cache ${status} reason: (${white(cacheReason)})`
                )
              }
              let url = metric.url

              if (url.length > 48) {
                const parsed = new URL(url)
                const truncatedHost = formatRequestUrl(
                  parsed.host,
                  shouldTruncateUrl ? 16 : undefined
                )
                const truncatedPath = formatRequestUrl(
                  parsed.pathname,
                  shouldTruncateUrl ? 24 : undefined
                )
                const truncatedSearch = formatRequestUrl(
                  parsed.search,
                  shouldTruncateUrl ? 16 : undefined
                )

                url =
                  parsed.protocol +
                  '//' +
                  truncatedHost +
                  truncatedPath +
                  truncatedSearch
              }

              const status = cacheColor(`(cache ${cacheStatus})`)
              const newLineLeadingChar = '│'
              const nestedIndent = calcNestedLevel(
                fetchMetrics.slice(0, i + 1),
                metric.start
              )

              writeStdoutLine(
                `${newLineLeadingChar}${nestedIndent}${white(
                  metric.method
                )} ${white(url)} ${metric.status} in ${duration}ms ${status}`
              )
              if (cacheReasonStr) {
                const nextNestedIndent = calcNestedLevel(
                  fetchMetrics.slice(0, i + 1),
                  metric.start
                )

                writeStdoutLine(
                  `${newLineLeadingChar}${nextNestedIndent}${newLineLeadingChar} ${cacheReasonStr}`
                )
              }
            }
          }
          delete normalizedReq.fetchMetrics
          originalResponse.off('close', reqCallback)
        }
        originalResponse.on('close', reqCallback)
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
  }

  public async render(
    req: NodeNextRequest | IncomingMessage,
    res: NodeNextResponse | ServerResponse,
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
    req: NodeNextRequest | IncomingMessage,
    res: NodeNextResponse | ServerResponse,
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

  protected async renderErrorToResponseImpl(
    ctx: RequestContext<NodeNextRequest, NodeNextResponse>,
    err: Error | null
  ) {
    const { req, res, query } = ctx
    const is404 = res.statusCode === 404

    if (is404 && this.enabledDirectories.app) {
      if (this.renderOpts.dev) {
        await this.ensurePage({
          page: UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
          clientOnly: false,
          url: req.url,
        }).catch(() => {})
      }

      if (
        this.getEdgeFunctionsPages().includes(UNDERSCORE_NOT_FOUND_ROUTE_ENTRY)
      ) {
        await this.runEdgeFunction({
          req,
          res,
          query: query || {},
          params: {},
          page: UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
          appPaths: null,
        })
        return null
      }
    }
    return super.renderErrorToResponseImpl(ctx, err)
  }

  public async renderError(
    err: Error | null,
    req: NodeNextRequest | IncomingMessage,
    res: NodeNextResponse | ServerResponse,
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
    req: NodeNextRequest | IncomingMessage,
    res: NodeNextResponse | ServerResponse,
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
    req: NodeNextRequest | IncomingMessage,
    res: NodeNextResponse | ServerResponse,
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

  protected getMiddlewareManifest(): MiddlewareManifest | null {
    if (this.minimalMode) return null
    const manifest: MiddlewareManifest = require(this.middlewareManifestPath)
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
    wasm: { filePath: string; name: string }[]
    env: { [key: string]: string }
    assets?: { filePath: string; name: string }[]
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
      wasm: (pageInfo.wasm ?? []).map((binding) => ({
        ...binding,
        filePath: join(this.distDir, binding.filePath),
      })),
      assets:
        pageInfo.assets &&
        pageInfo.assets.map((binding) => {
          return {
            ...binding,
            filePath: join(this.distDir, binding.filePath),
          }
        }),
      env: pageInfo.env,
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
  protected async ensureMiddleware(_url?: string) {}
  protected async ensureEdgeFunction(_params: {
    page: string
    appPaths: string[] | null
    url?: string
  }) {}

  /**
   * This method gets all middleware matchers and execute them when the request
   * matches. It will make sure that each middleware exists and is compiled and
   * ready to be invoked. The development server will decorate it to add warns
   * and errors with rich traces.
   */
  protected async runMiddleware(params: {
    request: NodeNextRequest
    response: NodeNextResponse
    parsedUrl: ParsedUrl
    parsed: UrlWithParsedQuery
    onWarning?: (warning: Error) => void
  }) {
    if (process.env.NEXT_MINIMAL) {
      throw new Error(
        'invariant: runMiddleware should not be called in minimal mode'
      )
    }

    // Middleware is skipped for on-demand revalidate requests
    if (
      checkIsOnDemandRevalidate(params.request, this.renderOpts.previewProps)
        .isOnDemandRevalidate
    ) {
      return {
        response: new Response(null, { headers: { 'x-middleware-next': '1' } }),
      } as FetchEventResult
    }

    let url: string

    if (this.nextConfig.skipMiddlewareUrlNormalize) {
      url = getRequestMeta(params.request, 'initURL')!
    } else {
      // For middleware to "fetch" we must always provide an absolute URL
      const query = urlQueryToSearchParams(params.parsed.query).toString()
      const locale = params.parsed.query.__nextLocale

      url = `${getRequestMeta(params.request, 'initProtocol')}://${
        this.fetchHostname || 'localhost'
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

    await this.ensureMiddleware(params.request.url)
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
      edgeFunctionEntry: middlewareInfo,
      request: {
        headers: params.request.headers,
        method,
        nextConfig: {
          basePath: this.nextConfig.basePath,
          i18n: this.nextConfig.i18n,
          trailingSlash: this.nextConfig.trailingSlash,
          experimental: this.nextConfig.experimental,
        },
        url: url,
        page,
        body: getRequestMeta(params.request, 'clonableBody'),
        signal: signalFromNodeResponse(params.response.originalResponse),
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
      addRequestMeta(params.request, 'middlewareCookie', cookies)
    }

    return result
  }

  protected handleCatchallMiddlewareRequest: NodeRouteHandler = async (
    req,
    res,
    parsed
  ) => {
    const isMiddlewareInvoke = getRequestMeta(req, 'middlewareInvoke')

    if (!isMiddlewareInvoke) {
      return false
    }

    const handleFinished = () => {
      addRequestMeta(req, 'middlewareInvoke', true)
      res.body('').send()
      return true
    }

    const middleware = this.getMiddleware()
    if (!middleware) {
      return handleFinished()
    }

    const initUrl = getRequestMeta(req, 'initURL')!
    const parsedUrl = parseUrl(initUrl)
    const pathnameInfo = getNextPathnameInfo(parsedUrl.pathname, {
      nextConfig: this.nextConfig,
      i18nProvider: this.i18nProvider,
    })

    parsedUrl.pathname = pathnameInfo.pathname
    const normalizedPathname = removeTrailingSlash(parsed.pathname || '')
    if (!middleware.match(normalizedPathname, req, parsedUrl.query)) {
      return handleFinished()
    }

    let result: Awaited<
      ReturnType<typeof NextNodeServer.prototype.runMiddleware>
    >
    let bubblingResult = false

    try {
      await this.ensureMiddleware(req.url)

      result = await this.runMiddleware({
        request: req,
        response: res,
        parsedUrl: parsedUrl,
        parsed: parsed,
      })

      if ('response' in result) {
        if (isMiddlewareInvoke) {
          bubblingResult = true
          throw new BubbledError(true, result)
        }

        for (const [key, value] of Object.entries(
          toNodeOutgoingHttpHeaders(result.response.headers)
        )) {
          if (key !== 'content-encoding' && value !== undefined) {
            res.setHeader(key, value as string | string[])
          }
        }
        res.statusCode = result.response.status

        const { originalResponse } = res
        if (result.response.body) {
          await pipeToNodeResponse(result.response.body, originalResponse)
        } else {
          originalResponse.end()
        }
        return true
      }
    } catch (err: any) {
      if (bubblingResult) {
        throw err
      }

      if (isError(err) && err.code === 'ENOENT') {
        await this.render404(req, res, parsed)
        return true
      }

      if (err instanceof DecodeError) {
        res.statusCode = 400
        await this.renderError(err, req, res, parsed.pathname || '')
        return true
      }

      const error = getProperError(err)
      console.error(error)
      res.statusCode = 500
      await this.renderError(error, req, res, parsed.pathname || '')
      return true
    }

    return result.finished
  }

  private _cachedPreviewManifest: PrerenderManifest | undefined
  protected getPrerenderManifest(): PrerenderManifest {
    if (this._cachedPreviewManifest) {
      return this._cachedPreviewManifest
    }
    if (
      this.renderOpts?.dev ||
      this.serverOptions?.dev ||
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

    this._cachedPreviewManifest = loadManifest(
      join(this.distDir, PRERENDER_MANIFEST)
    ) as PrerenderManifest

    return this._cachedPreviewManifest
  }

  protected getRoutesManifest(): NormalizedRouteManifest | undefined {
    return getTracer().trace(NextNodeServerSpan.getRoutesManifest, () => {
      const manifest = loadManifest(join(this.distDir, ROUTES_MANIFEST)) as any

      let rewrites = manifest.rewrites ?? {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      }

      if (Array.isArray(rewrites)) {
        rewrites = {
          beforeFiles: [],
          afterFiles: rewrites,
          fallback: [],
        }
      }

      return { ...manifest, rewrites }
    })
  }

  protected attachRequestMeta(
    req: NodeNextRequest,
    parsedUrl: NextUrlWithParsedQuery,
    isUpgradeReq?: boolean
  ) {
    // Injected in base-server.ts
    const protocol = req.headers['x-forwarded-proto']?.includes('https')
      ? 'https'
      : 'http'

    // When there are hostname and port we build an absolute URL
    const initUrl =
      this.fetchHostname && this.port
        ? `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
        : this.nextConfig.experimental.trustHostHeader
          ? `https://${req.headers.host || 'localhost'}${req.url}`
          : req.url

    addRequestMeta(req, 'initURL', initUrl)
    addRequestMeta(req, 'initQuery', { ...parsedUrl.query })
    addRequestMeta(req, 'initProtocol', protocol)

    if (!isUpgradeReq) {
      addRequestMeta(req, 'clonableBody', getCloneableBody(req.originalRequest))
    }
  }

  protected async runEdgeFunction(params: {
    req: NodeNextRequest
    res: NodeNextResponse
    query: ParsedUrlQuery
    params: Params | undefined
    page: string
    appPaths: string[] | null
    match?: RouteMatch
    onError?: (err: unknown) => void
    onWarning?: (warning: Error) => void
  }): Promise<FetchEventResult | null> {
    if (process.env.NEXT_MINIMAL) {
      throw new Error(
        'Middleware is not supported in minimal mode. Please remove the `NEXT_MINIMAL` environment variable.'
      )
    }
    let edgeInfo: ReturnType<typeof this.getEdgeFunctionInfo> | undefined

    const { query, page, match } = params

    if (!match)
      await this.ensureEdgeFunction({
        page,
        appPaths: params.appPaths,
        url: params.req.url,
      })
    edgeInfo = this.getEdgeFunctionInfo({
      page,
      middleware: false,
    })

    if (!edgeInfo) {
      return null
    }

    // For edge to "fetch" we must always provide an absolute URL
    const isNextDataRequest = !!query.__nextDataReq
    const initialUrl = new URL(
      getRequestMeta(params.req, 'initURL') || '/',
      'http://n'
    )
    const queryString = urlQueryToSearchParams({
      ...Object.fromEntries(initialUrl.searchParams),
      ...query,
      ...params.params,
    }).toString()

    if (isNextDataRequest) {
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
        body: getRequestMeta(params.req, 'clonableBody'),
        signal: signalFromNodeResponse(params.res.originalResponse),
      },
      useCache: true,
      onError: params.onError,
      onWarning: params.onWarning,
      incrementalCache:
        (globalThis as any).__incrementalCache ||
        getRequestMeta(params.req, 'incrementalCache'),
    })

    if (result.fetchMetrics) {
      params.req.fetchMetrics = result.fetchMetrics
    }

    if (!params.res.statusCode || params.res.statusCode < 400) {
      params.res.statusCode = result.response.status
      params.res.statusMessage = result.response.statusText
    }

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

    const { originalResponse } = params.res
    if (result.response.body) {
      await pipeToNodeResponse(result.response.body, originalResponse)
    } else {
      originalResponse.end()
    }

    return result
  }

  protected get serverDistDir(): string {
    if (this._serverDistDir) {
      return this._serverDistDir
    }
    const serverDistDir = join(this.distDir, SERVER_DIRECTORY)
    this._serverDistDir = serverDistDir
    return serverDistDir
  }

  protected async getFallbackErrorComponents(
    _url?: string
  ): Promise<LoadComponentsReturnType | null> {
    // Not implemented for production use cases, this is implemented on the
    // development server.
    return null
  }
}
