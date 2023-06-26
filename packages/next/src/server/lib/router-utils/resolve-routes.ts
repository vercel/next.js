import type { TLSSocket } from 'tls'
import type { FsOutput } from './filesystem'
import type { IncomingMessage } from 'http'
import type { NextConfigComplete } from '../../config-shared'

import url from 'url'
import { Redirect } from '../../../../types'
import { RenderWorker } from '../router-server'
import { getCloneableBody } from '../../body-streams'
import { filterReqHeaders } from '../server-ipc/utils'
import { Header } from '../../../lib/load-custom-routes'
import { stringifyQuery } from '../../server-route-utils'
import { invokeRequest } from '../server-ipc/invoke-request'
import { getCookieParser, setLazyProp } from '../../api-utils'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { getRedirectStatus } from '../../../lib/redirect-status'
import { addRequestMeta, getRequestMeta } from '../../request-meta'
import { normalizeRepeatedSlashes } from '../../../shared/lib/utils'
import { getPathMatch } from '../../../shared/lib/router/utils/path-match'
import { relativizeURL } from '../../../shared/lib/router/utils/relativize-url'
import {
  compileNonPath,
  matchHas,
  prepareDestination,
} from '../../../shared/lib/router/utils/prepare-destination'

export function getResolveRoutes(
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >,
  config: NextConfigComplete,
  opts: Parameters<typeof import('../router-server').initialize>[0],
  renderWorkers: {
    app?: RenderWorker
    pages?: RenderWorker
  },
  renderWorkerOpts: Parameters<RenderWorker['initialize']>[0]
) {
  const routes: ({
    match: ReturnType<typeof getPathMatch>
    check?: boolean
    name?: string
  } & Partial<Header> &
    Partial<Redirect>)[] = [
    // _next/data with middleware handling

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

  return resolveRoutes
}
