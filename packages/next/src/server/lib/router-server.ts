import type { IncomingMessage } from 'http'

// this must come first as it includes require hooks
import type {
  WorkerRequestHandler,
  WorkerUpgradeHandler,
} from './setup-server-worker'

import url from 'url'
import path from 'path'
import loadConfig from '../config'
import setupDebug from 'next/dist/compiled/debug'
import { splitCookiesString, toNodeOutgoingHttpHeaders } from '../web/utils'
import { Telemetry } from '../../telemetry/storage'
import { DecodeError } from '../../shared/lib/utils'
import { filterReqHeaders, ipcForbiddenHeaders } from './server-ipc/utils'
import { findPagesDir } from '../../lib/find-pages-dir'
import { setupFsCheck } from './router-utils/filesystem'
import { proxyRequest } from './router-utils/proxy-request'
import { invokeRequest } from './server-ipc/invoke-request'
import { isAbortError, pipeReadable } from '../pipe-readable'
import { createRequestResponseMocks } from './mock-request'
import { createIpcServer, createWorker } from './server-ipc'
import { UnwrapPromise } from '../../lib/coalesced-function'
import { getResolveRoutes } from './router-utils/resolve-routes'
import {
  NEXT_INTERNAL_QUERY,
  NextUrlWithParsedQuery,
  getRequestMeta,
} from '../request-meta'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import setupCompression from 'next/dist/compiled/compression'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'
import { handleOutput } from './router-utils/handle-output'
import ResponseCache from '../response-cache'

import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  PERMANENT_REDIRECT_STATUS,
} from '../../shared/lib/constants'

const debug = setupDebug('next:router-server:main')

export type RenderWorker = Pick<
  typeof import('./render-server'),
  | 'initialize'
  | 'deleteCache'
  | 'clearModuleContext'
  | 'deleteAppClientCache'
  | 'propagateServerField'
>

export interface RenderWorkers {
  app?: Awaited<ReturnType<typeof createWorker>>
  pages?: Awaited<ReturnType<typeof createWorker>>
}

export async function initialize(opts: {
  dir: string
  port: number
  dev: boolean
  minimalMode?: boolean
  hostname?: string
  workerType: 'router' | 'render'
  isNodeDebugging: boolean
  keepAliveTimeout?: number
  customServer?: boolean
  experimentalTestProxy?: boolean
}): Promise<[WorkerRequestHandler, WorkerUpgradeHandler]> {
  process.title = 'next-router-worker'

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = opts.dev ? 'development' : 'production'
  }

  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir,
    undefined,
    undefined,
    true
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

  const renderWorkers: RenderWorkers = {}
  const distDir = path.join(opts.dir, config.distDir)
  const responseCache = new ResponseCache(!!opts.minimalMode)

  let devInstance:
    | UnwrapPromise<
        ReturnType<typeof import('./router-utils/setup-dev').setupDev>
      >
    | undefined

  if (opts.dev) {
    const telemetry = new Telemetry({
      distDir,
    })
    const { pagesDir, appDir } = findPagesDir(
      opts.dir,
      !!config.experimental.appDir
    )

    const { setupDev } =
      (await require('./router-utils/setup-dev')) as typeof import('./router-utils/setup-dev')
    devInstance = await setupDev({
      // Passed here but the initialization of this object happens below, doing the initialization before the setupDev call breaks.
      renderWorkers,
      appDir,
      pagesDir,
      telemetry,
      fsChecker,
      dir: opts.dir,
      nextConfig: config,
      isCustomServer: opts.customServer,
      turbo: !!process.env.EXPERIMENTAL_TURBOPACK,
    })
  }

  const ipcMethods = {
    async ensurePage(
      match: Parameters<
        InstanceType<
          typeof import('../dev/hot-reloader-webpack').default
        >['ensurePage']
      >[0]
    ) {
      // TODO: remove after ensure is pulled out of server
      return await devInstance?.hotReloader.ensurePage(match)
    },
    async logErrorWithOriginalStack(...args: any[]) {
      // @ts-ignore
      return await devInstance?.logErrorWithOriginalStack(...args)
    },
    async getFallbackErrorComponents() {
      await devInstance?.hotReloader?.buildFallbackError()
      // Build the error page to ensure the fallback is built too.
      // TODO: See if this can be moved into hotReloader or removed.
      await devInstance?.hotReloader.ensurePage({
        page: '/_error',
        clientOnly: false,
      })
    },
    async getCompilationError(page: string) {
      const errors = await devInstance?.hotReloader?.getCompilationErrors(page)
      if (!errors) return

      // Return the very first error we found.
      return errors[0]
    },
    async revalidate({
      urlPath,
      revalidateHeaders,
      opts: revalidateOpts,
    }: {
      urlPath: string
      revalidateHeaders: IncomingMessage['headers']
      opts: any
    }) {
      const mocked = createRequestResponseMocks({
        url: urlPath,
        headers: revalidateHeaders,
      })

      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      await requestHandler(mocked.req, mocked.res)
      await mocked.res.hasStreamed

      if (
        mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
        !(
          mocked.res.statusCode === 404 && revalidateOpts.unstable_onlyGenerated
        )
      ) {
        throw new Error(`Invalid response ${mocked.res.statusCode}`)
      }
      return {}
    },
  }

  // TODO: update param type
  const { ipcPort, ipcValidationKey } = await createIpcServer(ipcMethods as any)

  // Set global environment variables for the app render server to use.
  process.env.__NEXT_PRIVATE_ROUTER_IPC_PORT = ipcPort + ''
  process.env.__NEXT_PRIVATE_ROUTER_IPC_KEY = ipcValidationKey
  process.env.__NEXT_PRIVATE_PREBUNDLED_REACT = config.experimental
    .serverActions
    ? 'experimental'
    : 'next'

  renderWorkers.app =
    require('./render-server') as typeof import('./render-server')

  const { initialEnv } = require('@next/env') as typeof import('@next/env')
  renderWorkers.pages = await createWorker(
    ipcPort,
    ipcValidationKey,
    opts.isNodeDebugging,
    'pages',
    config,
    initialEnv
  )

  const renderWorkerOpts: Parameters<RenderWorker['initialize']>[0] = {
    port: opts.port,
    dir: opts.dir,
    workerType: 'render',
    hostname: opts.hostname,
    minimalMode: opts.minimalMode,
    dev: !!opts.dev,
    isNodeDebugging: !!opts.isNodeDebugging,
    serverFields: devInstance?.serverFields || {},
    experimentalTestProxy: !!opts.experimentalTestProxy,
  }

  // pre-initialize workers
  const initialized = {
    app: await renderWorkers.app?.initialize(renderWorkerOpts),
    pages: await renderWorkers.pages?.initialize(renderWorkerOpts),
  }

  if (devInstance) {
    const originalNextDeleteCache = (global as any)._nextDeleteCache
    ;(global as any)._nextDeleteCache = async (filePaths: string[]) => {
      // Multiple instances of Next.js can be instantiated, since this is a global we have to call the original if it exists.
      if (originalNextDeleteCache) {
        await originalNextDeleteCache(filePaths)
      }
      try {
        await Promise.all([
          renderWorkers.pages?.deleteCache(filePaths),
          renderWorkers.app?.deleteCache(filePaths),
        ])
      } catch (err) {
        console.error(err)
      }
    }
    const originalNextDeleteAppClientCache = (global as any)
      ._nextDeleteAppClientCache
    ;(global as any)._nextDeleteAppClientCache = async () => {
      // Multiple instances of Next.js can be instantiated, since this is a global we have to call the original if it exists.
      if (originalNextDeleteAppClientCache) {
        await originalNextDeleteAppClientCache()
      }
      try {
        await Promise.all([
          renderWorkers.pages?.deleteAppClientCache(),
          renderWorkers.app?.deleteAppClientCache(),
        ])
      } catch (err) {
        console.error(err)
      }
    }
    const originalNextClearModuleContext = (global as any)
      ._nextClearModuleContext
    ;(global as any)._nextClearModuleContext = async (targetPath: string) => {
      // Multiple instances of Next.js can be instantiated, since this is a global we have to call the original if it exists.
      if (originalNextClearModuleContext) {
        await originalNextClearModuleContext()
      }
      try {
        await Promise.all([
          renderWorkers.pages?.clearModuleContext(targetPath),
          renderWorkers.app?.clearModuleContext(targetPath),
        ])
      } catch (err) {
        console.error(err)
      }
    }
  }

  const logError = async (
    type: 'uncaughtException' | 'unhandledRejection',
    err: Error | undefined
  ) => {
    await devInstance?.logErrorWithOriginalStack(err, type)
  }

  const cleanup = () => {
    debug('router-server process cleanup')
    for (const curWorker of [
      ...((renderWorkers.pages as any)?._workerPool?._workers || []),
    ] as {
      _child?: import('child_process').ChildProcess
    }[]) {
      curWorker._child?.kill('SIGINT')
    }

    if (!process.env.__NEXT_PRIVATE_CPU_PROFILE) {
      process.exit(0)
    }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('uncaughtException', logError.bind(null, 'uncaughtException'))
  process.on('unhandledRejection', logError.bind(null, 'unhandledRejection'))

  let requestHandler: WorkerRequestHandler

  const resolveRoutes = getResolveRoutes({
    opts,
    config,
    distDir,
    fsChecker,
    ipcMethods,
    // @ts-ignore
    requestHandler,
    responseCache,
    ensureMiddleware: devInstance?.ensureMiddleware,
  })

  const requestHandlerImpl: WorkerRequestHandler = async (req, res) => {
    // these fields can not be inserted from initial request so we filter them
    for (const key of NEXT_INTERNAL_QUERY) {
      delete req.headers[key]
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
      type: keyof typeof renderWorkers,
      invokePath: string,
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

      const workerResult = initialized[type]

      if (!workerResult) {
        throw new Error(`Failed to initialize render worker ${type}`)
      }

      const renderUrl = `http://${workerResult.hostname}:${workerResult.port}${req.url}`

      const invokeHeaders: typeof req.headers = {
        ...req.headers,
        'x-middleware-invoke': '',
        'x-invoke-path': invokePath,
        'x-invoke-query': encodeURIComponent(JSON.stringify(parsedUrl.query)),
        ...(additionalInvokeHeaders || {}),
      }

      debug('invokeRender', renderUrl, invokeHeaders)

      let invokeRes
      try {
        invokeRes = await invokeRequest(
          renderUrl,
          {
            headers: invokeHeaders,
            method: req.method,
            signal: signalFromNodeResponse(res),
          },
          getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
        )
      } catch (e) {
        // If the client aborts before we can receive a response object (when
        // the headers are flushed), then we can early exit without further
        // processing.
        if (isAbortError(e)) {
          return
        }
        throw e
      }

      debug('invokeRender res', invokeRes.status, invokeRes.headers)

      for (const [key, value] of Object.entries(
        filterReqHeaders(
          toNodeOutgoingHttpHeaders(invokeRes.headers),
          ipcForbiddenHeaders
        )
      )) {
        if (value !== undefined) {
          if (key === 'set-cookie') {
            const curValue = res.getHeader(key) as string
            const newValue: string[] = [] as string[]

            for (const cookie of Array.isArray(curValue)
              ? curValue
              : splitCookiesString(curValue || '')) {
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
      res.statusCode = invokeRes.status || 200
      res.statusMessage = invokeRes.statusText || ''

      if (invokeRes.body) {
        await pipeReadable(invokeRes.body, res)
      } else {
        res.end()
      }
      return
    }

    try {
      // handle hot-reloader first
      if (devInstance) {
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        }
        const parsedUrl = url.parse(req.url || '/')

        const hotReloaderResult = await devInstance.hotReloader.run(
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
        invokedOutputs,
      })

      if (devInstance && matchedOutput?.type === 'devVirtualFsItem') {
        const origUrl = req.url || '/'

        if (config.basePath && pathHasPrefix(origUrl, config.basePath)) {
          req.url = removePathPrefix(origUrl, config.basePath)
        }

        if (resHeaders) {
          for (const key of Object.keys(resHeaders)) {
            res.setHeader(key, resHeaders[key])
          }
        }
        const result = await devInstance.requestHandler(req, res)

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

        if (Buffer.isBuffer(bodyStream)) {
          res.end(bodyStream)
          return
        }
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

      if (matchedOutput) {
        if (
          (matchedOutput.type === 'appFile' ||
            matchedOutput.type === 'pageFile') &&
          devInstance?.hotReloader.ensurePage
        ) {
          await devInstance.hotReloader.ensurePage({
            page: matchedOutput.itemPath,
            clientOnly: false,
            appPaths: matchedOutput.appPaths,
          })
        }
        return await handleOutput({
          req,
          res,
          distDir,
          parsedUrl,
          fsChecker,
          ipcMethods,
          responseCache,
          dev: opts.dev,
          port: opts.port + '',
          hostname: opts.hostname || 'localhost',
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          requestHandler,
          nextConfig: config,
          output: matchedOutput,
          invokeRender,
          minimalMode: !!opts.minimalMode,
        })
      }
    } catch (err: any) {
      if (typeof err.statusCode === 'number') {
        const invokePath = `/${err.statusCode}`
        const invokeStatus = `${err.statusCode}`
        return await invokeRender(
          url.parse(invokePath, true),
          'pages',
          invokePath,
          {
            'x-invoke-status': invokeStatus,
          }
        )
      }

      let invokePath = `/500`
      let invokeStatus = `500`

      if (err instanceof DecodeError) {
        invokePath = '/400'
        invokeStatus = '400'
      }

      return await invokeRender(
        url.parse(invokePath, true),
        'pages',
        invokePath,
        {
          'x-invoke-status': invokeStatus,
          'x-invoke-error': JSON.stringify({
            message: err.message,
            stack: err.stack,
          }),
        }
      )
    }

    // 404 case
    res.setHeader(
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate'
    )

    const appNotFound = opts.dev
      ? devInstance?.serverFields.hasAppNotFound
      : await fsChecker.getItem('/_not-found')

    if (appNotFound) {
      return await invokeRender(
        url.parse(req.url || '/', true),
        'app',
        '/_not-found',
        {
          'x-invoke-status': '404',
        }
      )
    }
    await invokeRender(url.parse(req.url || '/', true), 'pages', '/404', {
      'x-invoke-status': '404',
    })
  }

  requestHandler = requestHandlerImpl
  if (opts.experimentalTestProxy) {
    // Intercept fetch and other testmode apis.
    const {
      wrapRequestHandlerWorker,
      interceptTestApis,
    } = require('../../experimental/testmode/server')
    requestHandler = wrapRequestHandlerWorker(requestHandler)
    interceptTestApis()
  }

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

      if (opts.dev && devInstance) {
        if (req.url?.includes(`/_next/webpack-hmr`)) {
          return devInstance.hotReloader.onHMR(req, socket, head)
        }
      }

      const { matchedOutput, parsedUrl } = await resolveRoutes({
        req,
        res: socket as any,
        isUpgradeReq: true,
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
