// this must come first as it includes require hooks
import type { WorkerRequestHandler, WorkerUpgradeHandler } from './types'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { NextUrlWithParsedQuery } from '../request-meta'
// This is required before other imports to ensure the require hook is setup.
import '../node-polyfill-fetch'
import '../node-environment'
import '../require-hook'
import '../../lib/polyfill-promise-with-resolvers'

import url from 'url'
import path from 'path'
import loadConfig from '../config'
import { serveStatic } from '../serve-static'
import setupDebug from 'next/dist/compiled/debug'
import { Telemetry } from '../../telemetry/storage'
import { DecodeError } from '../../shared/lib/utils'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import { isAbortError, pipeReadable } from '../pipe-readable'
import { getResolveRoutes } from './router-utils/resolve-routes'
import { getRequestMeta } from '../request-meta'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import setupCompression from 'next/dist/compiled/compression'
import { NoFallbackError } from '../base-server'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'

import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  PERMANENT_REDIRECT_STATUS,
} from '../../shared/lib/constants'
import { DevBundlerService } from './dev-bundler-service'
import type { TLSSocket } from 'tls'
import { filterInternalHeaders } from './server-ipc/utils'

const debug = setupDebug('next:router-server:main')

export type RenderServer = Pick<
  typeof import('./render-server'),
  | 'initialize'
  | 'deleteCache'
  | 'clearModuleContext'
  | 'deleteAppClientCache'
  | 'propagateServerField'
>

export interface LazyRenderServerInstance {
  instance?: RenderServer
}

const requestHandlers: Record<string, WorkerRequestHandler> = {}

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  server?: import('http').Server
  minimalMode?: boolean
  hostname?: string
  isNodeDebugging: boolean
  keepAliveTimeout?: number
  customServer?: boolean
  experimentalTestProxy?: boolean
  experimentalHttpsServer?: boolean
}): Promise<[WorkerRequestHandler, WorkerUpgradeHandler]> {
  process.title = 'next-router-worker'

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

  if (opts.dev) {
    const telemetry = new Telemetry({
      distDir: path.join(opts.dir, config.distDir),
    })
    const { pagesDir, appDir } = findPagesDir(opts.dir)

    const { setupDevBundler } =
      require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

    developmentBundler = await setupDevBundler({
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
    })

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

  const randomBytes = new Uint8Array(8)
  crypto.getRandomValues(randomBytes)
  const middlewareSubrequestId = Buffer.from(randomBytes).toString('hex')
  ;(globalThis as any)[Symbol.for('@next/middleware-subrequest-id')] =
    middlewareSubrequestId

  const renderServerOpts: Parameters<RenderServer['initialize']>[0] = {
    port: opts.port,
    dir: opts.dir,
    hostname: opts.hostname,
    minimalMode: opts.minimalMode,
    dev: !!opts.dev,
    server: opts.server,
    isNodeDebugging: !!opts.isNodeDebugging,
    serverFields: developmentBundler?.serverFields || {},
    experimentalTestProxy: !!opts.experimentalTestProxy,
    experimentalHttpsServer: !!opts.experimentalHttpsServer,
    bundlerService: devBundlerService,
  }

  // pre-initialize workers
  const handlers = await renderServer.instance.initialize(renderServerOpts)

  const logError = async (
    type: 'uncaughtException' | 'unhandledRejection',
    err: Error | undefined
  ) => {
    await developmentBundler?.logErrorWithOriginalStack(err, type)
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

  const requestHandlerImpl: WorkerRequestHandler = async (req, res) => {
    // internal headers should not be honored by the request handler
    if (!process.env.NEXT_PRIVATE_TEST_HEADERS) {
      filterInternalHeaders(req.headers)
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
      additionalInvokeHeaders: Record<string, string> = {}
    ) {
      // invokeRender expects /api routes to not be locale prefixed
      // so normalize here before continuing
      if (
        config.i18n &&
        removePathPrefix(invokePath, config.basePath).startsWith(
          `/${parsedUrl.query.__nextLocale}/api`
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
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end('{}')
        return null
      }

      if (!handlers) {
        throw new Error('Failed to initialize render server')
      }

      const invokeHeaders: typeof req.headers = {
        ...req.headers,
        'x-middleware-invoke': '',
        'x-invoke-path': invokePath,
        'x-invoke-query': encodeURIComponent(JSON.stringify(parsedUrl.query)),
        'x-forwarded-host':
          req.headers['x-forwarded-host'] ?? req.headers.host ?? opts.hostname,
        'x-forwarded-port':
          req.headers['x-forwarded-port'] ?? opts.port.toString(),
        'x-forwarded-proto':
          req.headers['x-forwarded-proto'] ??
          (req.socket as TLSSocket).encrypted
            ? 'https'
            : 'http',
        'x-forwarded-for':
          req.headers['x-forwarded-for'] ?? req.socket.remoteAddress,
        ...(additionalInvokeHeaders || {}),
      }
      Object.assign(req.headers, invokeHeaders)

      debug('invokeRender', req.url, invokeHeaders)

      try {
        const initResult = await renderServer?.instance?.initialize(
          renderServerOpts
        )
        try {
          await initResult?.requestHandler(req, res)
        } catch (err) {
          if (err instanceof NoFallbackError) {
            // eslint-disable-next-line
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
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
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

        if (statusCode === PERMANENT_REDIRECT_STATUS) {
          res.setHeader('Refresh', `0;url=${destination}`)
        }
        return res.end(destination)
      }

      // handle middleware body response
      if (bodyStream) {
        res.statusCode = statusCode || 200
        return await pipeReadable(bodyStream, res)
      }

      if (finished && parsedUrl.protocol) {
        return await proxyRequest(
          req,
          res,
          parsedUrl,
          undefined,
          getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream(),
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
          await invokeRender(parsedUrl, '/_error', handleIndex, {
            'x-invoke-status': '500',
            'x-invoke-error': JSON.stringify({
              message: `A conflicting public file and page file was found for path ${matchedOutput.itemPath} https://nextjs.org/docs/messages/conflicting-public-file-page`,
            }),
          })
          return
        }

        if (
          !res.getHeader('cache-control') &&
          matchedOutput.type === 'nextStaticFolder'
        ) {
          if (opts.dev) {
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
              'x-invoke-status': '405',
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
            const invokeStatus = `${err.statusCode}`
            res.statusCode = err.statusCode
            return await invokeRender(
              url.parse(invokePath, true),
              invokePath,
              handleIndex,
              {
                'x-invoke-status': invokeStatus,
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
            'x-invoke-output': matchedOutput.itemPath,
          }
        )
      }

      // 404 case
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )

      // Short-circuit favicon.ico serving so that the 404 page doesn't get built as favicon is requested by the browser when loading any route.
      if (opts.dev && !matchedOutput && parsedUrl.pathname === '/favicon.ico') {
        res.statusCode = 404
        res.end('')
        return null
      }

      const appNotFound = opts.dev
        ? developmentBundler?.serverFields.hasAppNotFound
        : await fsChecker.getItem('/_not-found')

      res.statusCode = 404

      if (appNotFound) {
        return await invokeRender(
          parsedUrl,
          opts.dev ? '/not-found' : '/_not-found',
          handleIndex,
          {
            'x-invoke-status': '404',
          }
        )
      }

      await invokeRender(parsedUrl, '/404', handleIndex, {
        'x-invoke-status': '404',
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
          'x-invoke-status': invokeStatus,
        })
      } catch (err2) {
        console.error(err2)
      }
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  let requestHandler: WorkerRequestHandler = requestHandlerImpl
  if (opts.experimentalTestProxy) {
    // Intercept fetch and other testmode apis.
    const {
      wrapRequestHandlerWorker,
      interceptTestApis,
    } = require('../../experimental/testmode/server')
    requestHandler = wrapRequestHandlerWorker(requestHandler)
    interceptTestApis()
  }
  requestHandlers[opts.dir] = requestHandler

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

      if (opts.dev && developmentBundler) {
        if (req.url?.includes(`/_next/webpack-hmr`)) {
          return developmentBundler.hotReloader.onHMR(req, socket, head)
        }
      }

      const { matchedOutput, parsedUrl } = await resolveRoutes({
        req,
        res: socket as any,
        isUpgradeReq: true,
        signal: signalFromNodeResponse(socket),
      })

      // TODO: allow upgrade requests to pages/app paths?
      // this was not previously supported
      if (matchedOutput) {
        return socket.end()
      }

      if (parsedUrl.protocol) {
        return await proxyRequest(req, socket as any, parsedUrl, head)
      }
      // no match close socket
      socket.end()
    } catch (err) {
      console.error('Error handling upgrade request', err)
      socket.end()
    }
  }

  return [requestHandler, upgradeHandler]
}
