// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'

import url from 'url'
import loadConfig from '../config'
import { serveStatic } from '../serve-static'
import { getRequestMeta } from '../request-meta'
import { splitCookiesString } from '../web/utils'
import { DecodeError } from '../../shared/lib/utils'
import { filterReqHeaders } from './server-ipc/utils'
import { IncomingMessage, ServerResponse } from 'http'
import { stringifyQuery } from '../server-route-utils'
import { setupFsCheck } from './router-utils/filesystem'
import { invokeRequest } from './server-ipc/invoke-request'
import { createIpcServer, createWorker } from './server-ipc'
import { getResolveRoutes } from './router-utils/resolve-routes'

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
  const config = await loadConfig(
    opts.dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER,
    opts.dir
  )

  const renderWorkerOpts: Parameters<RenderWorker['initialize']>[0] = {
    port: 0,
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

  const { ipcPort, ipcValidationKey } = await createIpcServer({} as any)

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

  async function proxyRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: url.UrlWithParsedQuery,
    upgradeHead?: any
  ) {
    const { query } = parsedUrl
    delete (parsedUrl as any).query
    parsedUrl.search = stringifyQuery(req as any, query)

    const target = url.format(parsedUrl)
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
        upgradeHead && opts.dev
          ? undefined
          : config.experimental.proxyTimeout || 30_000,
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
        proxy.web(req, res, {
          buffer: getRequestMeta(
            req,
            '__NEXT_CLONABLE_BODY'
          )?.cloneBodyStream(),
        })
      }
    })
  }

  const requestHandler: Parameters<typeof initializeServerWorker>[0] = async (
    req,
    res
  ) => {
    async function invokeRender(
      parsedUrl: url.UrlWithParsedQuery,
      type: keyof typeof renderWorkers,
      invokePath: string,
      invokeStatus?: string
    ) {
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

      // TODO: remove when next/image is handled directly
      if (invokePath === '/_next/image') {
        delete invokeHeaders['x-invoke-path']
        delete invokeHeaders['x-invoke-query']
      }

      const invokeRes = await invokeRequest(
        renderUrl,
        {
          headers: invokeHeaders,
          method: req.method,
        },
        getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
      )

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

    try {
      const {
        finished,
        parsedUrl,
        statusCode,
        resHeaders,
        bodyStream,
        matchedOutput,
      } = await resolveRoutes(req, false)

      console.log('requestHandler!', req.url, {
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
      if (statusCode && statusCode > 300 && statusCode < 400) {
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
        return await proxyRequest(req, res, parsedUrl)
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

          if (
            typeof err.statusCode === 'number' &&
            [400, 412, 416].includes(err.statusCode)
          ) {
            const invokePath = `/${err.statusCode}`
            const invokeStatus = `${err.statusCode}`
            return await invokeRender(
              url.parse(invokePath, true),
              'pages',
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
          parsedUrl.pathname || '/'
        )
      }

      // 404 case
      res.setHeader(
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate'
      )
      await invokeRender(parsedUrl, 'pages', '/404', '404')
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
      const { matchedOutput, parsedUrl } = await resolveRoutes(req, true)

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
