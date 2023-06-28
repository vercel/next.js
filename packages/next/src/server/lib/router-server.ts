// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'

import url from 'url'
import loadConfig from '../config'
import { proxyRequest } from './router-utils/proxy-request'
import { serveStatic } from '../serve-static'
import setupDebug from 'next/dist/compiled/debug'
import { splitCookiesString } from '../web/utils'
import { DecodeError } from '../../shared/lib/utils'
import { filterReqHeaders } from './server-ipc/utils'
import { IncomingMessage, ServerResponse } from 'http'
import { setupFsCheck } from './router-utils/filesystem'
import { invokeRequest } from './server-ipc/invoke-request'
import { createRequestResponseMocks } from './mock-request'
import { createIpcServer, createWorker } from './server-ipc'
import setupCompression from 'next/dist/compiled/compression'
import { getResolveRoutes } from './router-utils/resolve-routes'
import { NextUrlWithParsedQuery, getRequestMeta } from '../request-meta'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'

import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
  PERMANENT_REDIRECT_STATUS,
} from '../../shared/lib/constants'

let initializeResult:
  | undefined
  | {
      port: number
      hostname: string
    }

const debug = setupDebug('next:router-server:main')

export type RenderWorker = Worker & {
  initialize: typeof import('./render-server').initialize
  deleteCache: typeof import('./render-server').deleteCache
  deleteAppClientCache: typeof import('./render-server').deleteAppClientCache
  clearModuleContext: typeof import('./render-server').clearModuleContext
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
}): Promise<NonNullable<typeof initializeResult>> {
  if (initializeResult) {
    return initializeResult
  }

  if (!process.env.NODE_ENV) {
    // @ts-ignore not readonly
    process.env.NODE_ENV = opts.dev ? 'development' : 'production'
  }

  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir
  )

  const renderWorkerOpts: Parameters<RenderWorker['initialize']>[0] = {
    port: opts.port,
    dir: opts.dir,
    workerType: 'render',
    hostname: opts.hostname,
    minimalMode: opts.minimalMode,
    dev: !!opts.dev,
    isNodeDebugging: !!opts.isNodeDebugging,
  }
  const renderWorkers: {
    app?: RenderWorker
    pages?: RenderWorker
  } = {}

  const { ipcPort, ipcValidationKey } = await createIpcServer({
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
  } as any)

  if (!!config.experimental.appDir) {
    renderWorkers.app = await createWorker(
      ipcPort,
      ipcValidationKey,
      opts.isNodeDebugging,
      'app',
      config.experimental.serverActions
    )
  }
  renderWorkers.pages = await createWorker(
    ipcPort,
    ipcValidationKey,
    opts.isNodeDebugging,
    'pages'
  )

  let compress: ReturnType<typeof setupCompression> | undefined

  if (config.compress) {
    compress = setupCompression()
  }

  const fsChecker = await setupFsCheck({
    dev: opts.dev,
    dir: opts.dir,
    config,
  })

  const resolveRoutes = getResolveRoutes(
    fsChecker,
    config,
    opts,
    renderWorkers,
    renderWorkerOpts
  )

  function writeResponseChunk(res: ServerResponse, chunk: Buffer) {
    res.write(chunk)
    if ('flush' in res) {
      ;(res as any).flush()
    }
  }

  const requestHandler: Parameters<typeof initializeServerWorker>[0] = async (
    req,
    res
  ) => {
    const matchedDynamicRoutes = new Set<string>()

    async function invokeRender(
      parsedUrl: NextUrlWithParsedQuery,
      type: keyof typeof renderWorkers,
      handleIndex: number,
      invokePath: string,
      invokeStatus?: string
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
        fsChecker.getMiddlewareMatchers().length &&
        removePathPrefix(invokePath, config.basePath) === '/404'
      ) {
        res.setHeader('x-nextjs-matched-path', parsedUrl.pathname || '')
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end('{}')
        return null
      }

      if (type === 'pages') {
        invokePath = denormalizePagePath(invokePath)
      }

      const workerResult = await renderWorkers[type]?.initialize(
        renderWorkerOpts
      )

      if (!workerResult) {
        throw new Error(`Failed to initialize render worker ${type}`)
      }

      const renderUrl = `http://${workerResult.hostname}:${workerResult.port}${req.url}`

      const invokeHeaders: typeof req.headers = {
        'cache-control': '',
        ...req.headers,
        'x-middleware-invoke': '',
        'x-invoke-path': invokePath,
        'x-invoke-query': encodeURIComponent(JSON.stringify(parsedUrl.query)),
        ...(invokeStatus
          ? {
              'x-invoke-status': invokeStatus,
            }
          : {}),
      }

      debug('invokeRender', renderUrl, invokeHeaders)

      const invokeRes = await invokeRequest(
        renderUrl,
        {
          headers: invokeHeaders,
          method: req.method,
        },
        getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
      )

      debug('invokeRender res', invokeRes.statusCode, invokeRes.headers)

      // when we receive x-no-fallback we restart
      if (invokeRes.headers['x-no-fallback']) {
        // eslint-disable-next-line
        await handleRequest(handleIndex + 1)
        return
      }

      for (const [key, value] of Object.entries(
        filterReqHeaders({ ...invokeRes.headers })
      )) {
        if (value !== undefined) {
          if (key === 'set-cookie') {
            const curValue = res.getHeader(key) as string
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
      res.statusCode = invokeRes.statusCode || 200
      res.statusMessage = invokeRes.statusMessage || ''

      for await (const chunk of invokeRes) {
        if (res.closed) break
        writeResponseChunk(res, chunk)
      }
      return res.end()
    }

    const handleRequest = async (handleIndex: number) => {
      if (handleIndex > 5) {
        throw new Error(`Attempted to handle request too many times ${req.url}`)
      }

      const {
        finished,
        parsedUrl,
        statusCode,
        resHeaders,
        bodyStream,
        matchedOutput,
      } = await resolveRoutes(req, matchedDynamicRoutes, false)

      debug('requestHandler!', req.url, {
        matchedOutput,
        statusCode,
        resHeaders,
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

        for await (const chunk of bodyStream) {
          writeResponseChunk(res, chunk)
        }
        return res.end()
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

      if (matchedOutput?.fsPath) {
        if (
          !opts.dev &&
          !res.getHeader('cache-control') &&
          matchedOutput.type === 'nextStaticFolder'
        ) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
        if (!(req.method === 'GET' || req.method === 'HEAD')) {
          res.setHeader('Allow', ['GET', 'HEAD'])
          return await invokeRender(
            url.parse('/405', true),
            'pages',
            handleIndex,
            '/405',
            '405'
          )
        }

        try {
          return await serveStatic(req, res, matchedOutput.fsPath)
        } catch (err: any) {
          // normalize additional 400 case
          if (!err.statusCode && err.expose === false) {
            err.statusCode = 400
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

          if (
            typeof err.statusCode === 'number' &&
            POSSIBLE_ERROR_CODE_FROM_SERVE_STATIC.has(err.statusCode)
          ) {
            const invokePath = `/${err.statusCode}`
            const invokeStatus = `${err.statusCode}`
            return await invokeRender(
              url.parse(invokePath, true),
              'pages',
              handleIndex,
              invokePath,
              invokeStatus
            )
          }
          throw err
        }
      }

      if (matchedOutput) {
        return await invokeRender(
          parsedUrl,
          matchedOutput.type === 'appFile' ? 'app' : 'pages',
          handleIndex,
          parsedUrl.pathname || '/'
        )
      }

      // 404 case
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )
      await invokeRender(parsedUrl, 'pages', handleIndex, '/404', '404')
    }

    try {
      if (typeof compress === 'function') {
        // @ts-expect-error not express req/res
        compress(req, res, () => {})
      }
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
        return await invokeRender(
          url.parse(invokePath, true),
          'pages',
          0,
          invokePath,
          invokeStatus
        )
      } catch (err2) {
        console.error(err2)
      }
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  const upgradeHandler: Parameters<typeof initializeServerWorker>[1] = async (
    req,
    socket,
    head
  ) => {
    try {
      const { matchedOutput, parsedUrl } = await resolveRoutes(
        req,
        new Set(),
        true
      )

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

  const { port, hostname } = await initializeServerWorker(
    requestHandler,
    upgradeHandler,
    opts
  )

  initializeResult = {
    port,
    hostname: hostname === '0.0.0.0' ? '127.0.0.1' : hostname,
  }

  return initializeResult
}
