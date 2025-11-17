// this must come first as it includes require hooks
import type { WorkerRequestHandler, WorkerUpgradeHandler } from './types'
import type { DevBundler, ServerFields } from './router-utils/setup-dev-bundler'
import type { NextUrlWithParsedQuery, RequestMeta } from '../request-meta'

// This is required before other imports to ensure the require hook is setup.
import '../node-environment'
import '../require-hook'

import url from 'url'
import path from 'path'
import loadConfig from '../config'
import { serveStatic } from '../serve-static'
import setupDebug from 'next/dist/compiled/debug'
import * as Log from '../../build/output/log'
import { DecodeError } from '../../shared/lib/utils'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import { isAbortError, pipeToNodeResponse } from '../pipe-readable'
import { getResolveRoutes } from './router-utils/resolve-routes'
import { addRequestMeta, getRequestMeta } from '../request-meta'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import setupCompression from 'next/dist/compiled/compression'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'
import { isPostpone } from './router-utils/is-postpone'
import { parseUrl as parseUrlUtil } from '../../shared/lib/router/utils/parse-url'

import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  UNDERSCORE_NOT_FOUND_ROUTE,
} from '../../shared/lib/constants'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { DevBundlerService } from './dev-bundler-service'
import { type Span, trace } from '../../trace'
import { ensureLeadingSlash } from '../../shared/lib/page-path/ensure-leading-slash'
import { getNextPathnameInfo } from '../../shared/lib/router/utils/get-next-pathname-info'
import { getHostname } from '../../shared/lib/get-hostname'
import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { MockedResponse } from './mock-request'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type AppIsrManifestMessage,
} from '../dev/hot-reloader-types'
import { normalizedAssetPrefix } from '../../shared/lib/normalized-asset-prefix'
import { NEXT_PATCH_SYMBOL } from './patch-fetch'
import type { ServerInitResult } from './render-server'
import { filterInternalHeaders } from './server-ipc/utils'
import { blockCrossSite } from './router-utils/block-cross-site'
import { traceGlobals } from '../../trace/shared'
import { NoFallbackError } from '../../shared/lib/no-fallback-error.external'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from './router-utils/router-server-context'
import {
  handleChromeDevtoolsWorkspaceRequest,
  isChromeDevtoolsWorkspaceUrl,
} from './chrome-devtools-workspace'

const debug = setupDebug('next:router-server:main')
const isNextFont = (pathname: string | null) =>
  pathname && /\/media\/[^/]+\.(woff|woff2|eot|ttf|otf)$/.test(pathname)

export type RenderServer = Pick<
  typeof import('./render-server'),
  | 'initialize'
  | 'clearModuleContext'
  | 'propagateServerField'
  | 'getServerField'
>

export interface LazyRenderServerInstance {
  instance?: RenderServer
}

const requestHandlers: Record<string, WorkerRequestHandler> = {}

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
  server?: import('http').Server
  minimalMode?: boolean
  hostname?: string
  keepAliveTimeout?: number
  customServer?: boolean
  experimentalHttpsServer?: boolean
  startServerSpan?: Span
  quiet?: boolean
}): Promise<ServerInitResult> {
  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = opts.dev ? 'development' : 'production'
  }

  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir,
    { silent: false }
  )

  let compress: ReturnType<typeof setupCompression> | undefined

  if (config?.compress !== false) {
    compress = setupCompression()
  }

  const fsChecker = await setupFsCheck({
    dev: opts.dev,
    dir: opts.dir,
    config,
    minimalMode: opts.minimalMode,
  })

  const renderServer: LazyRenderServerInstance = {}

  let developmentBundler: DevBundler | undefined

  let devBundlerService: DevBundlerService | undefined

  let originalFetch = globalThis.fetch

  if (opts.dev) {
    const { Telemetry } =
      require('../../telemetry/storage') as typeof import('../../telemetry/storage')

    const telemetry = new Telemetry({
      distDir: path.join(opts.dir, config.distDir),
    })
    traceGlobals.set('telemetry', telemetry)

    const { pagesDir, appDir } = findPagesDir(opts.dir)

    const { setupDevBundler } =
      require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

    const resetFetch = () => {
      globalThis.fetch = originalFetch
      ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false
    }

    const setupDevBundlerSpan = opts.startServerSpan
      ? opts.startServerSpan.traceChild('setup-dev-bundler')
      : trace('setup-dev-bundler')
    developmentBundler = await setupDevBundlerSpan.traceAsyncFn(() =>
      setupDevBundler({
        // Passed here but the initialization of this object happens below, doing the initialization before the setupDev call breaks.
        renderServer,
        appDir,
        pagesDir,
        telemetry,
        fsChecker,
        dir: opts.dir,
        nextConfig: config,
        isCustomServer: opts.customServer,
        turbo: !!process.env.TURBOPACK,
        port: opts.port,
        onDevServerCleanup: opts.onDevServerCleanup,
        resetFetch,
      })
    )

    devBundlerService = new DevBundlerService(
      developmentBundler,
      // The request handler is assigned below, this allows us to create a lazy
      // reference to it.
      (req, res) => {
        return requestHandlers[opts.dir](req, res)
      }
    )
  }

  renderServer.instance =
    require('./render-server') as typeof import('./render-server')

  const requestHandlerImpl: WorkerRequestHandler = async (req, res) => {
    addRequestMeta(req, 'relativeProjectDir', relativeProjectDir)

    // internal headers should not be honored by the request handler
    if (!process.env.NEXT_PRIVATE_TEST_HEADERS) {
      filterInternalHeaders(req.headers)
    }

    if (
      !opts.minimalMode &&
      config.i18n &&
      config.i18n.localeDetection !== false
    ) {
      const urlParts = (req.url || '').split('?', 1)
      let urlNoQuery = urlParts[0] || ''

      if (config.basePath) {
        urlNoQuery = removePathPrefix(urlNoQuery, config.basePath)
      }

      const pathnameInfo = getNextPathnameInfo(urlNoQuery, {
        nextConfig: config,
      })

      const domainLocale = detectDomainLocale(
        config.i18n.domains,
        getHostname({ hostname: urlNoQuery }, req.headers)
      )

      const defaultLocale =
        domainLocale?.defaultLocale || config.i18n.defaultLocale

      const { getLocaleRedirect } =
        require('../../shared/lib/i18n/get-locale-redirect') as typeof import('../../shared/lib/i18n/get-locale-redirect')

      const parsedUrl = parseUrlUtil((req.url || '')?.replace(/^\/+/, '/'))

      const redirect = getLocaleRedirect({
        defaultLocale,
        domainLocale,
        headers: req.headers,
        nextConfig: config,
        pathLocale: pathnameInfo.locale,
        urlParsed: {
          ...parsedUrl,
          pathname: pathnameInfo.locale
            ? `/${pathnameInfo.locale}${urlNoQuery}`
            : urlNoQuery,
        },
      })

      if (redirect) {
        res.setHeader('Location', redirect)
        res.statusCode = RedirectStatusCode.TemporaryRedirect
        res.end(redirect)
        return
      }
    }

    if (compress) {
      // @ts-expect-error not express req/res
      compress(req, res, () => {})
    }
    req.on('error', (_err) => {
      // TODO: log socket errors?
    })
    res.on('error', (_err) => {
      // TODO: log socket errors?
    })

    const invokedOutputs = new Set<string>()

    async function invokeRender(
      parsedUrl: NextUrlWithParsedQuery,
      invokePath: string,
      handleIndex: number,
      additionalRequestMeta?: RequestMeta
    ) {
      // invokeRender expects /api routes to not be locale prefixed
      // so normalize here before continuing
      if (
        config.i18n &&
        removePathPrefix(invokePath, config.basePath).startsWith(
          `/${getRequestMeta(req, 'locale')}/api`
        )
      ) {
        invokePath = fsChecker.handleLocale(
          removePathPrefix(invokePath, config.basePath)
        ).pathname
      }

      if (
        req.headers['x-nextjs-data'] &&
        fsChecker.getMiddlewareMatchers()?.length &&
        removePathPrefix(invokePath, config.basePath) === '/404'
      ) {
        res.setHeader('x-nextjs-matched-path', parsedUrl.pathname || '')
        res.statusCode = 404
        res.setHeader('content-type', 'application/json')
        res.end('{}')
        return null
      }

      if (!handlers) {
        throw new Error('Failed to initialize render server')
      }

      addRequestMeta(req, 'invokePath', invokePath)
      addRequestMeta(req, 'invokeQuery', parsedUrl.query)
      addRequestMeta(req, 'middlewareInvoke', false)

      for (const key in additionalRequestMeta || {}) {
        addRequestMeta(
          req,
          key as keyof RequestMeta,
          additionalRequestMeta![key as keyof RequestMeta]
        )
      }

      debug('invokeRender', req.url, req.headers)

      try {
        const initResult =
          await renderServer?.instance?.initialize(renderServerOpts)
        try {
          await initResult?.requestHandler(req, res)
        } catch (err) {
          if (err instanceof NoFallbackError) {
            await handleRequest(handleIndex + 1)
            return
          }
          throw err
        }
        return
      } catch (e) {
        // If the client aborts before we can receive a response object (when
        // the headers are flushed), then we can early exit without further
        // processing.
        if (isAbortError(e)) {
          return
        }
        throw e
      }
    }

    const handleRequest = async (handleIndex: number) => {
      if (handleIndex > 5) {
        throw new Error(`Attempted to handle request too many times ${req.url}`)
      }

      // handle hot-reloader first
      if (developmentBundler) {
        if (blockCrossSite(req, res, config.allowedDevOrigins, opts.hostname)) {
          return
        }

        const origUrl = req.url || '/'

        // both the basePath and assetPrefix need to be stripped from the URL
        // so that the development bundler can find the correct file
        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        } else if (
          config.assetPrefix &&
          pathHasPrefix(origUrl, config.assetPrefix)
        ) {
          req.url = removePathPrefix(origUrl, config.assetPrefix)
        }

        const parsedUrl = url.parse(req.url || '/')

        const hotReloaderResult = await developmentBundler.hotReloader.run(
          req,
          res,
          parsedUrl
        )

        if (hotReloaderResult.finished) {
          return hotReloaderResult
        }

        req.url = origUrl
      }

      const {
        finished,
        parsedUrl,
        statusCode,
        resHeaders,
        bodyStream,
        matchedOutput,
      } = await resolveRoutes({
        req,
        res,
        isUpgradeReq: false,
        signal: signalFromNodeResponse(res),
        invokedOutputs,
      })

      if (res.closed || res.finished) {
        return
      }

      if (developmentBundler && matchedOutput?.type === 'devVirtualFsItem') {
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        } else if (
          config.assetPrefix &&
          pathHasPrefix(origUrl, config.assetPrefix)
        ) {
          req.url = removePathPrefix(origUrl, config.assetPrefix)
        }

        if (resHeaders) {
          for (const key of Object.keys(resHeaders)) {
            res.setHeader(key, resHeaders[key])
          }
        }
        const result = await developmentBundler.requestHandler(req, res)

        if (result.finished) {
          return
        }
        // TODO: throw invariant if we resolved to this but it wasn't handled?
        req.url = origUrl
      }

      debug('requestHandler!', req.url, {
        matchedOutput,
        statusCode,
        resHeaders,
        bodyStream: !!bodyStream,
        parsedUrl: {
          pathname: parsedUrl.pathname,
          query: parsedUrl.query,
        },
        finished,
      })

      // apply any response headers from routing
      for (const key of Object.keys(resHeaders || {})) {
        res.setHeader(key, resHeaders[key])
      }

      // handle redirect
      if (!bodyStream && statusCode && statusCode > 300 && statusCode < 400) {
        const destination = url.format(parsedUrl)
        res.statusCode = statusCode
        res.setHeader('location', destination)

        if (statusCode === RedirectStatusCode.PermanentRedirect) {
          res.setHeader('Refresh', `0;url=${destination}`)
        }
        return res.end(destination)
      }

      // handle middleware body response
      if (bodyStream) {
        res.statusCode = statusCode || 200
        return await pipeToNodeResponse(bodyStream, res)
      }

      if (finished && parsedUrl.protocol) {
        return await proxyRequest(
          req,
          res,
          parsedUrl,
          undefined,
          getRequestMeta(req, 'clonableBody')?.cloneBodyStream(),
          config.experimental.proxyTimeout
        )
      }

      if (matchedOutput?.fsPath && matchedOutput.itemPath) {
        if (
          opts.dev &&
          (fsChecker.appFiles.has(matchedOutput.itemPath) ||
            fsChecker.pageFiles.has(matchedOutput.itemPath))
        ) {
          res.statusCode = 500
          const message = `A conflicting public file and page file was found for path ${matchedOutput.itemPath} https://nextjs.org/docs/messages/conflicting-public-file-page`
          await invokeRender(parsedUrl, '/_error', handleIndex, {
            invokeStatus: 500,
            invokeError: new Error(message),
          })
          Log.error(message)
          return
        }

        if (
          !res.getHeader('cache-control') &&
          matchedOutput.type === 'nextStaticFolder'
        ) {
          if (opts.dev && !isNextFont(parsedUrl.pathname)) {
            res.setHeader('Cache-Control', 'no-store, must-revalidate')
          } else {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable'
            )
          }
        }
        if (!(req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Allow', ['GET', 'HEAD'])
          res.statusCode = 405
          return await invokeRender(
            url.parse('/405', true),
            '/405',
            handleIndex,
            {
              invokeStatus: 405,
            }
          )
        }

        try {
          return await serveStatic(req, res, matchedOutput.itemPath, {
            root: matchedOutput.itemsRoot,
            // Ensures that etags are not generated for static files when disabled.
            etag: config.generateEtags,
          })
        } catch (err: any) {
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

          let validErrorStatus = POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC.has(
            err.statusCode
          )

          // normalize non-allowed status codes
          if (!validErrorStatus) {
            ;(err as any).statusCode = 400
          }

          if (typeof err.statusCode === 'number') {
            const invokePath = `/${err.statusCode}`
            const invokeStatus = err.statusCode
            res.statusCode = err.statusCode
            return await invokeRender(
              url.parse(invokePath, true),
              invokePath,
              handleIndex,
              {
                invokeStatus,
              }
            )
          }
          throw err
        }
      }

      if (matchedOutput) {
        invokedOutputs.add(matchedOutput.itemPath)

        return await invokeRender(
          parsedUrl,
          parsedUrl.pathname || '/',
          handleIndex,
          {
            invokeOutput: matchedOutput.itemPath,
          }
        )
      }

      if (opts.dev && isChromeDevtoolsWorkspaceUrl(parsedUrl)) {
        await handleChromeDevtoolsWorkspaceRequest(res, opts, config)
        return
      }

      // 404 case
      res.setHeader(
        'Cache-Control',
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )

      let realRequestPathname = parsedUrl.pathname ?? ''
      if (realRequestPathname) {
        if (config.basePath) {
          realRequestPathname = removePathPrefix(
            realRequestPathname,
            config.basePath
          )
        }
        if (config.assetPrefix) {
          realRequestPathname = removePathPrefix(
            realRequestPathname,
            config.assetPrefix
          )
        }
        if (config.i18n) {
          realRequestPathname = removePathPrefix(
            realRequestPathname,
            '/' + (getRequestMeta(req, 'locale') ?? '')
          )
        }
      }
      // For not found static assets, return plain text 404 instead of
      // full HTML 404 pages to save bandwidth.
      if (realRequestPathname.startsWith('/_next/static/')) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Not Found')
        return null
      }

      // Short-circuit favicon.ico serving so that the 404 page doesn't get built as favicon is requested by the browser when loading any route.
      if (opts.dev && !matchedOutput && parsedUrl.pathname === '/favicon.ico') {
        res.statusCode = 404
        res.end('')
        return null
      }

      const appNotFound = opts.dev
        ? developmentBundler?.serverFields.hasAppNotFound
        : await fsChecker.getItem(UNDERSCORE_NOT_FOUND_ROUTE)

      res.statusCode = 404

      if (appNotFound) {
        return await invokeRender(
          parsedUrl,
          UNDERSCORE_NOT_FOUND_ROUTE,
          handleIndex,
          {
            invokeStatus: 404,
          }
        )
      }

      await invokeRender(parsedUrl, '/404', handleIndex, {
        invokeStatus: 404,
      })
    }

    try {
      await handleRequest(0)
    } catch (err) {
      try {
        let invokePath = '/500'
        let invokeStatus = '500'

        if (err instanceof DecodeError) {
          invokePath = '/400'
          invokeStatus = '400'
        } else {
          console.error(err)
        }
        res.statusCode = Number(invokeStatus)
        return await invokeRender(url.parse(invokePath, true), invokePath, 0, {
          invokeStatus: res.statusCode,
        })
      } catch (err2) {
        console.error(err2)
      }
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  let requestHandler: WorkerRequestHandler = requestHandlerImpl
  if (config.experimental.testProxy) {
    // Intercept fetch and other testmode apis.
    const { wrapRequestHandlerWorker, interceptTestApis } =
      // eslint-disable-next-line @next/internal/typechecked-require -- experimental/testmode is not built ins next/dist/esm
      require('next/dist/experimental/testmode/server') as typeof import('../../experimental/testmode/server')
    requestHandler = wrapRequestHandlerWorker(requestHandler)
    interceptTestApis()
    // We treat the intercepted fetch as "original" fetch that should be reset to during HMR.
    originalFetch = globalThis.fetch
  }
  requestHandlers[opts.dir] = requestHandler

  const renderServerOpts: Parameters<RenderServer['initialize']>[0] = {
    port: opts.port,
    dir: opts.dir,
    hostname: opts.hostname,
    minimalMode: opts.minimalMode,
    dev: !!opts.dev,
    server: opts.server,
    serverFields: {
      ...(developmentBundler?.serverFields || {}),
      setIsrStatus: devBundlerService?.setIsrStatus.bind(devBundlerService),
    } satisfies ServerFields,
    experimentalTestProxy: !!config.experimental.testProxy,
    experimentalHttpsServer: !!opts.experimentalHttpsServer,
    bundlerService: devBundlerService,
    startServerSpan: opts.startServerSpan,
    quiet: opts.quiet,
    onDevServerCleanup: opts.onDevServerCleanup,
  }
  renderServerOpts.serverFields.routerServerHandler = requestHandlerImpl

  // pre-initialize workers
  const handlers = await renderServer.instance.initialize(renderServerOpts)

  // this must come after initialize of render server since it's
  // using initialized methods
  if (!routerServerGlobal[RouterServerContextSymbol]) {
    routerServerGlobal[RouterServerContextSymbol] = {}
  }
  const relativeProjectDir = path.relative(process.cwd(), opts.dir)

  routerServerGlobal[RouterServerContextSymbol][relativeProjectDir] = {
    nextConfig: config,
    hostname: handlers.server.hostname,
    revalidate: handlers.server.revalidate.bind(handlers.server),
    render404: handlers.server.render404.bind(handlers.server),
    experimentalTestProxy: renderServerOpts.experimentalTestProxy,
    logErrorWithOriginalStack: opts.dev
      ? handlers.server.logErrorWithOriginalStack.bind(handlers.server)
      : (err: unknown) => !opts.quiet && Log.error(err),
    setCacheStatus: config.cacheComponents
      ? devBundlerService?.setCacheStatus.bind(devBundlerService)
      : undefined,
    setIsrStatus: devBundlerService?.setIsrStatus.bind(devBundlerService),
    setReactDebugChannel: config.experimental.reactDebugChannel
      ? devBundlerService?.setReactDebugChannel.bind(devBundlerService)
      : undefined,
  }

  const logError = async (
    type: 'uncaughtException' | 'unhandledRejection',
    err: Error | undefined
  ) => {
    if (isPostpone(err)) {
      // React postpones that are unhandled might end up logged here but they're
      // not really errors. They're just part of rendering.
      return
    }
    if (type === 'unhandledRejection') {
      Log.error('unhandledRejection: ', err)
    } else if (type === 'uncaughtException') {
      Log.error('uncaughtException: ', err)
    }
  }

  process.on('uncaughtException', logError.bind(null, 'uncaughtException'))
  process.on('unhandledRejection', logError.bind(null, 'unhandledRejection'))

  const resolveRoutes = getResolveRoutes(
    fsChecker,
    config,
    opts,
    renderServer.instance,
    renderServerOpts,
    developmentBundler?.ensureMiddleware
  )

  const upgradeHandler: WorkerUpgradeHandler = async (req, socket, head) => {
    try {
      req.on('error', (_err) => {
        // TODO: log socket errors?
        // console.error(_err);
      })
      socket.on('error', (_err) => {
        // TODO: log socket errors?
        // console.error(_err);
      })

      if (opts.dev && developmentBundler && req.url) {
        if (
          blockCrossSite(req, socket, config.allowedDevOrigins, opts.hostname)
        ) {
          return
        }
        const { basePath, assetPrefix } = config

        let hmrPrefix = basePath

        // assetPrefix overrides basePath for HMR path
        if (assetPrefix) {
          hmrPrefix = normalizedAssetPrefix(assetPrefix)

          if (URL.canParse(hmrPrefix)) {
            // remove trailing slash from pathname
            // return empty string if pathname is '/'
            // to avoid conflicts with '/_next' below
            hmrPrefix = new URL(hmrPrefix).pathname.replace(/\/$/, '')
          }
        }

        const isHMRRequest = req.url.startsWith(
          ensureLeadingSlash(`${hmrPrefix}/_next/webpack-hmr`)
        )

        // only handle HMR requests if the basePath in the request
        // matches the basePath for the handler responding to the request
        if (isHMRRequest) {
          return developmentBundler.hotReloader.onHMR(
            req,
            socket,
            head,
            (client, { isLegacyClient }) => {
              if (isLegacyClient) {
                // Only send the ISR manifest to legacy clients, i.e. Pages
                // Router clients, or App Router clients that have Cache
                // Components disabled. The ISR manifest is only used to inform
                // the static indicator, which currently does not provide useful
                // information if Cache Components is enabled due to its binary
                // nature (i.e. it does not support showing info for partially
                // static pages).
                client.send(
                  JSON.stringify({
                    type: HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST,
                    data: devBundlerService?.appIsrManifest || {},
                  } satisfies AppIsrManifestMessage)
                )
              }
            }
          )
        }
      }

      const res = new MockedResponse({
        resWriter: () => {
          throw new Error(
            'Invariant: did not expect response writer to be written to for upgrade request'
          )
        },
      })
      const { matchedOutput, parsedUrl } = await resolveRoutes({
        req,
        res,
        isUpgradeReq: true,
        signal: signalFromNodeResponse(socket),
      })

      // TODO: allow upgrade requests to pages/app paths?
      // this was not previously supported
      if (matchedOutput) {
        return socket.end()
      }

      if (parsedUrl.protocol) {
        return await proxyRequest(req, socket, parsedUrl, head)
      }

      // If there's no matched output, we don't handle the request as user's
      // custom WS server may be listening on the same path.
    } catch (err) {
      console.error('Error handling upgrade request', err)
      socket.end()
    }
  }

  return {
    requestHandler,
    upgradeHandler,
    server: handlers.server,
    closeUpgraded() {
      developmentBundler?.hotReloader?.close()
    },
  }
}
