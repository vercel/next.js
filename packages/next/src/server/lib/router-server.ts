// this must come first as it includes require hooks
import { initializeServerWorker } from './setup-server-worker'

import url from 'url'
import { TLSSocket } from 'tls'
import loadConfig from '../config'
import { Redirect } from '../../../types'
import { serveStatic } from '../serve-static'
import { splitCookiesString } from '../web/utils'
import { getCloneableBody } from '../body-streams'
import { Header } from '../../lib/load-custom-routes'
import { filterReqHeaders } from './server-ipc/utils'
import { IncomingMessage, ServerResponse } from 'http'
import { stringifyQuery } from '../server-route-utils'
import { getCookieParser, setLazyProp } from '../api-utils'
import { invokeRequest } from './server-ipc/invoke-request'
import { createIpcServer, createWorker } from './server-ipc'
import { getRedirectStatus } from '../../lib/redirect-status'
import { addRequestMeta, getRequestMeta } from '../request-meta'
import { DecodeError, normalizeRepeatedSlashes } from '../../shared/lib/utils'
import { FsOutput, setupFsCheck } from './router-utils/filesystem'
import { getPathMatch } from '../../shared/lib/router/utils/path-match'
import { relativizeURL } from '../../shared/lib/router/utils/relativize-url'

import {
  matchHas,
  compileNonPath,
  prepareDestination,
} from '../../shared/lib/router/utils/prepare-destination'
import {
  PHASE_PRODUCTION_SERVER,
  PHASE_DEVELOPMENT_SERVER,
} from '../../shared/lib/constants'

let initializeResult:
  | undefined
  | {
      port: number
      hostname: string
    }

type RenderWorker = Worker & {
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

  const routes: ({
    match: ReturnType<typeof getPathMatch>
    check?: boolean
    name?: string
  } & Partial<Header> &
    Partial<Redirect>)[] = [
    ...fsChecker.headers,
    ...fsChecker.redirects,

    // check middleware (using matchers)
    { match: () => ({} as any), name: 'middleware' },

    ...fsChecker.rewrites.beforeFiles,

    // we check exact matches on fs before continuing to
    // after files rewrites
    { match: () => ({} as any), name: 'check_fs' },

    ...fsChecker.rewrites.afterFiles,

    // we always do the check: true handling before continuing to
    // fallback rewrites
    {
      check: true,
      match: () => ({} as any),
      name: 'after files check: true',
    },

    ...fsChecker.rewrites.fallback,
  ]

  async function resolveRoutes(
    req: IncomingMessage,
    isUpgradeReq?: boolean
  ): Promise<{
    finished: boolean
    statusCode?: number
    bodyStream?: IncomingMessage
    resHeaders: Record<string, string | string[]>
    parsedUrl: url.UrlWithParsedQuery
    matchedOutput?: FsOutput | null
  }> {
    let finished = false
    let resHeaders: Record<string, string | string[]> = {}
    let matchedOutput: FsOutput | null = null
    let parsedUrl = url.parse(req.url || '', true)

    const urlParts = (req.url || '').split('?')
    const urlNoQuery = urlParts[0]

    // this normalizes repeated slashes in the path e.g. hello//world ->
    // hello/world or backslashes to forward slashes, this does not
    // handle trailing slash as that is handled the same as a next.config.js
    // redirect
    if (urlNoQuery?.match(/(\\|\/\/)/)) {
      parsedUrl = url.parse(normalizeRepeatedSlashes(req.url!), true)
      return {
        parsedUrl,
        resHeaders,
        finished: true,
        statusCode: 308,
      }
    }
    // TODO: inherit this from higher up
    const protocol = (req?.socket as TLSSocket)?.encrypted ? 'https' : 'http'

    // When there are hostname and port we build an absolute URL
    const initUrl =
      opts.hostname && opts.port
        ? `protocol://${opts.hostname}:${opts.port}${req.url}`
        : (config.experimental as any).trustHostHeader
        ? `https://${req.headers.host || 'localhost'}${req.url}`
        : req.url || ''

    addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
    addRequestMeta(req, '_protocol', protocol)
    setLazyProp({ req }, 'cookies', () => getCookieParser(req.headers)())

    if (!isUpgradeReq) {
      addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req))
    }

    async function checkTrue() {
      const dynamicRoutes = fsChecker.getDynamicRoutes()

      for (const route of dynamicRoutes) {
        const params = route.match(parsedUrl.pathname)

        if (params) {
          const output = await fsChecker.getItem(route.page)
          return output
        }
      }
      const output = await fsChecker.getItem(parsedUrl.pathname || '')

      if (output) {
        return output
      }
    }

    for (const route of routes) {
      let params = route.match(parsedUrl.pathname)

      if ((route.has || route.missing) && params) {
        const hasParams = matchHas(
          req,
          parsedUrl.query,
          route.has,
          route.missing
        )
        if (hasParams) {
          Object.assign(params, hasParams)
        } else {
          params = false
        }
      }

      if (params) {
        if (route.name === 'check_fs') {
          const output = await fsChecker.getItem(parsedUrl.pathname || '')

          if (output) {
            matchedOutput = output
            return {
              parsedUrl,
              resHeaders,
              finished: true,
              matchedOutput,
            }
          }
        }

        if (route.name === 'middleware') {
          const match = fsChecker.getMiddlewareMatchers()

          // @ts-expect-error BaseNextRequest stuff
          if (match(parsedUrl.pathname, req, parsedUrl.query)) {
            const workerResult = await (
              renderWorkers.app || renderWorkers.pages
            )?.initialize(renderWorkerOpts)

            if (!workerResult) {
              throw new Error(`Failed to initialize render worker "middleware"`)
            }

            const stringifiedQuery = stringifyQuery(req as any, parsedUrl.query)
            const renderUrl = `http://${workerResult.hostname}:${
              workerResult.port
            }${parsedUrl.pathname}${
              stringifiedQuery ? '?' : ''
            }${stringifiedQuery}`

            const invokeHeaders: typeof req.headers = {
              ...req.headers,
              'x-invoke-path': '',
              'x-invoke-query': '',
              'x-middleware-invoke': '1',
            }
            const middlewareRes = await invokeRequest(
              renderUrl.toString(),
              {
                headers: invokeHeaders,
                method: req.method,
              },
              getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
            )

            if (middlewareRes.headers['x-middleware-override-headers']) {
              const overriddenHeaders: Set<string> = new Set()
              let overrideHeaders =
                middlewareRes.headers['x-middleware-override-headers']

              if (typeof overrideHeaders === 'string') {
                overrideHeaders = overrideHeaders.split(',')
              }

              for (const key of overrideHeaders) {
                overriddenHeaders.add(key.trim())
              }
              delete middlewareRes.headers['x-middleware-override-headers']

              // Delete headers.
              for (const key of Object.keys(req.headers)) {
                if (!overriddenHeaders.has(key)) {
                  delete req.headers[key]
                }
              }

              // Update or add headers.
              for (const key of overriddenHeaders.keys()) {
                const valueKey = 'x-middleware-request-' + key
                const newValue = middlewareRes.headers[valueKey]
                const oldValue = req.headers[key]

                if (oldValue !== newValue) {
                  req.headers[key] = newValue === null ? undefined : newValue
                }
                delete middlewareRes.headers[valueKey]
              }
            }

            if (
              !middlewareRes.headers['x-middleware-rewrite'] &&
              !middlewareRes.headers['x-middleware-next'] &&
              !middlewareRes.headers['location']
            ) {
              middlewareRes.headers['x-middleware-refresh'] = '1'
            }
            delete middlewareRes.headers['x-middleware-next']

            for (const [key, value] of Object.entries({
              ...filterReqHeaders(middlewareRes.headers),
            })) {
              if (
                [
                  'x-middleware-rewrite',
                  'x-middleware-redirect',
                  'x-middleware-refresh',
                ].includes(key)
              ) {
                continue
              }
              if (value) {
                resHeaders[key] = value
              }
            }

            if (middlewareRes.headers['x-middleware-rewrite']) {
              const value = middlewareRes.headers[
                'x-middleware-rewrite'
              ] as string
              const rel = relativizeURL(value, initUrl)
              resHeaders['x-middleware-rewrite'] = rel

              parsedUrl = url.parse(rel, true)

              if (parsedUrl.protocol) {
                return {
                  parsedUrl,
                  resHeaders,
                  finished: true,
                }
              }
            }

            if (middlewareRes.headers['location']) {
              const value = middlewareRes.headers['location'] as string
              const rel = relativizeURL(value, initUrl)
              resHeaders['location'] = rel

              parsedUrl = url.parse(rel, true)

              return {
                parsedUrl,
                resHeaders,
                finished: true,
                statusCode: middlewareRes.statusCode,
              }
            }

            if (middlewareRes.headers['x-middleware-refresh']) {
              return {
                parsedUrl,
                resHeaders,
                finished: true,
                bodyStream: middlewareRes,
                statusCode: middlewareRes.statusCode,
              }
            }
          }
        }

        // handle redirect
        if (
          ('statusCode' in route || 'permanent' in route) &&
          route.destination
        ) {
          const { parsedDestination } = prepareDestination({
            appendParamsToQuery: false,
            destination: route.destination,
            params: params,
            query: parsedUrl.query,
          })

          const { query } = parsedDestination
          delete (parsedDestination as any).query

          parsedDestination.search = stringifyQuery(req as any, query)

          let updatedDestination = url.format(parsedDestination)

          if (updatedDestination.startsWith('/')) {
            updatedDestination = normalizeRepeatedSlashes(updatedDestination)
          }

          return {
            finished: true,
            // @ts-expect-error custom ParsedUrl
            parsedUrl: parsedDestination,
            statusCode: getRedirectStatus(route),
          }
        }

        // handle headers
        if (route.headers) {
          const hasParams = Object.keys(params).length > 0
          for (const header of route.headers) {
            let { key, value } = header
            if (hasParams) {
              key = compileNonPath(key, params)
              value = compileNonPath(value, params)
            }

            if (key.toLowerCase() === 'set-cookie') {
              if (!Array.isArray(resHeaders[key])) {
                const val = resHeaders[key]
                resHeaders[key] = typeof val === 'string' ? [val] : []
              }
              ;(resHeaders[key] as string[]).push(value)
            } else {
              resHeaders[key] = value
            }
          }
        }

        // handle rewrite
        if (route.destination) {
          const { parsedDestination } = prepareDestination({
            appendParamsToQuery: true,
            destination: route.destination,
            params: params,
            query: parsedUrl.query,
          })

          if (parsedDestination.protocol) {
            return {
              // @ts-expect-error custom ParsedUrl
              parsedUrl: parsedDestination,
              finished: true,
            }
          }
          parsedUrl.pathname = parsedDestination.pathname
          Object.assign(parsedUrl.query, parsedDestination.query)
        }

        // handle check: true
        if (route.check) {
          const output = await checkTrue()

          if (output) {
            return {
              parsedUrl,
              resHeaders,
              finished: true,
              matchedOutput: output,
            }
          }
        }
      }
    }

    return {
      finished,
      parsedUrl,
      resHeaders,
      matchedOutput,
    }
  }

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
        return await serveStatic(req, res, matchedOutput.fsPath)
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
