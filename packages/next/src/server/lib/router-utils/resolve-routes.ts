import type { FsOutput } from './filesystem'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextConfigComplete } from '../../config-shared'
import type { RenderServer, initialize } from '../router-server'
import type { PatchMatcher } from '../../../shared/lib/router/utils/path-match'
import type { Redirect } from '../../../types'
import type { Header } from '../../../lib/load-custom-routes'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import url from 'url'
import path from 'node:path'
import setupDebug from 'next/dist/compiled/debug'
import { getCloneableBody } from '../../body-streams'
import { filterReqHeaders, ipcForbiddenHeaders } from '../server-ipc/utils'
import { stringifyQuery } from '../../server-route-utils'
import { formatHostname } from '../format-hostname'
import { toNodeOutgoingHttpHeaders } from '../../web/utils'
import { isAbortError } from '../../pipe-readable'
import { getHostname } from '../../../shared/lib/get-hostname'
import {
  getRedirectStatus,
  allowedStatusCodes,
} from '../../../lib/redirect-status'
import { normalizeRepeatedSlashes } from '../../../shared/lib/utils'
import { getRelativeURL } from '../../../shared/lib/router/utils/relativize-url'
import { addPathPrefix } from '../../../shared/lib/router/utils/add-path-prefix'
import { pathHasPrefix } from '../../../shared/lib/router/utils/path-has-prefix'
import { detectDomainLocale } from '../../../shared/lib/i18n/detect-domain-locale'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
import { removePathPrefix } from '../../../shared/lib/router/utils/remove-path-prefix'
import { NextDataPathnameNormalizer } from '../../normalizers/request/next-data'
import { BasePathPathnameNormalizer } from '../../normalizers/request/base-path'

import { addRequestMeta } from '../../request-meta'
import {
  compileNonPath,
  matchHas,
  prepareDestination,
} from '../../../shared/lib/router/utils/prepare-destination'
import type { TLSSocket } from 'tls'
import {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  RSC_HEADER,
} from '../../../client/components/app-router-headers'

const debug = setupDebug('next:router-server:resolve-routes')

export function getResolveRoutes(
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >,
  config: NextConfigComplete,
  opts: Parameters<typeof initialize>[0],
  renderServer: RenderServer,
  renderServerOpts: Parameters<RenderServer['initialize']>[0],
  ensureMiddleware?: (url?: string) => Promise<void>
) {
  type Route = {
    /**
     * The path matcher to check if this route applies to this request.
     */
    match: PatchMatcher
    check?: boolean
    name?: string
  } & Partial<Header> &
    Partial<Redirect>

  let routes: Route[] | null = null
  const calculateRoutes = () => {
    return [
      // _next/data with middleware handling
      { match: () => ({}), name: 'middleware_next_data' },

      ...(opts.minimalMode ? [] : fsChecker.headers),
      ...(opts.minimalMode ? [] : fsChecker.redirects),

      // check middleware (using matchers)
      { match: () => ({}), name: 'middleware' },

      ...(opts.minimalMode ? [] : fsChecker.rewrites.beforeFiles),

      // check middleware (using matchers)
      { match: () => ({}), name: 'before_files_end' },

      // we check exact matches on fs before continuing to
      // after files rewrites
      { match: () => ({}), name: 'check_fs' },

      ...(opts.minimalMode ? [] : fsChecker.rewrites.afterFiles),

      // we always do the check: true handling before continuing to
      // fallback rewrites
      {
        check: true,
        match: () => ({}),
        name: 'after files check: true',
      },

      ...(opts.minimalMode ? [] : fsChecker.rewrites.fallback),
    ]
  }

  async function resolveRoutes({
    req,
    res,
    isUpgradeReq,
    invokedOutputs,
  }: {
    req: IncomingMessage
    res: ServerResponse
    isUpgradeReq: boolean
    signal: AbortSignal
    invokedOutputs?: Set<string>
  }): Promise<{
    finished: boolean
    statusCode?: number
    bodyStream?: ReadableStream | null
    resHeaders: Record<string, string | string[]>
    parsedUrl: NextUrlWithParsedQuery
    matchedOutput?: FsOutput | null
  }> {
    let finished = false
    let resHeaders: Record<string, string | string[]> = {}
    let matchedOutput: FsOutput | null = null
    let parsedUrl = url.parse(req.url || '', true) as NextUrlWithParsedQuery
    let didRewrite = false

    const urlParts = (req.url || '').split('?', 1)
    const urlNoQuery = urlParts[0]

    // Refresh the routes every time in development mode, but only initialize them
    // once in production. We don't need to recompute these every time unless the routes
    // are changing like in development, and the performance can be costly.
    if (!routes || opts.dev) {
      routes = calculateRoutes()
    }

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
    const protocol =
      (req?.socket as TLSSocket)?.encrypted ||
      req.headers['x-forwarded-proto']?.includes('https')
        ? 'https'
        : 'http'

    // When there are hostname and port we build an absolute URL
    const initUrl = (config.experimental as any).trustHostHeader
      ? `https://${req.headers.host || 'localhost'}${req.url}`
      : opts.port
        ? `${protocol}://${formatHostname(opts.hostname || 'localhost')}:${
            opts.port
          }${req.url}`
        : req.url || ''

    addRequestMeta(req, 'initURL', initUrl)
    addRequestMeta(req, 'initQuery', { ...parsedUrl.query })
    addRequestMeta(req, 'initProtocol', protocol)

    if (!isUpgradeReq) {
      const bodySizeLimit = config.experimental.proxyClientMaxBodySize as
        | number
        | undefined
      addRequestMeta(req, 'clonableBody', getCloneableBody(req, bodySizeLimit))
    }

    const maybeAddTrailingSlash = (pathname: string) => {
      if (
        config.trailingSlash &&
        !config.skipProxyUrlNormalize &&
        !pathname.endsWith('/')
      ) {
        return `${pathname}/`
      }
      return pathname
    }

    let domainLocale: ReturnType<typeof detectDomainLocale> | undefined
    let defaultLocale: string | undefined
    let initialLocaleResult:
      | ReturnType<typeof normalizeLocalePath>
      | undefined = undefined

    if (config.i18n) {
      const hadTrailingSlash = parsedUrl.pathname?.endsWith('/')
      const hadBasePath = pathHasPrefix(
        parsedUrl.pathname || '',
        config.basePath
      )
      let normalizedPath = parsedUrl.pathname || '/'

      if (config.basePath && pathHasPrefix(normalizedPath, config.basePath)) {
        normalizedPath = removePathPrefix(normalizedPath, config.basePath)
      } else if (
        config.assetPrefix &&
        pathHasPrefix(normalizedPath, config.assetPrefix)
      ) {
        normalizedPath = removePathPrefix(normalizedPath, config.assetPrefix)
      }

      initialLocaleResult = normalizeLocalePath(
        normalizedPath,
        config.i18n.locales
      )

      domainLocale = detectDomainLocale(
        config.i18n.domains,
        getHostname(parsedUrl, req.headers)
      )
      defaultLocale = domainLocale?.defaultLocale || config.i18n.defaultLocale

      addRequestMeta(req, 'defaultLocale', defaultLocale)
      addRequestMeta(
        req,
        'locale',
        initialLocaleResult.detectedLocale || defaultLocale
      )

      // ensure locale is present for resolving routes
      if (
        !initialLocaleResult.detectedLocale &&
        !initialLocaleResult.pathname.startsWith('/_next/')
      ) {
        parsedUrl.pathname = addPathPrefix(
          initialLocaleResult.pathname === '/'
            ? `/${defaultLocale}`
            : addPathPrefix(
                initialLocaleResult.pathname || '',
                `/${defaultLocale}`
              ),
          hadBasePath ? config.basePath : ''
        )

        if (hadTrailingSlash) {
          parsedUrl.pathname = maybeAddTrailingSlash(parsedUrl.pathname)
        }
      }
    }

    const checkLocaleApi = (pathname: string) => {
      if (
        config.i18n &&
        pathname === urlNoQuery &&
        initialLocaleResult?.detectedLocale &&
        pathHasPrefix(initialLocaleResult.pathname, '/api')
      ) {
        return true
      }
    }

    async function checkTrue() {
      const pathname = parsedUrl.pathname || '/'

      if (checkLocaleApi(pathname)) {
        return
      }
      if (!invokedOutputs?.has(pathname)) {
        const output = await fsChecker.getItem(pathname)

        if (output) {
          if (
            config.useFileSystemPublicRoutes ||
            didRewrite ||
            (output.type !== 'appFile' && output.type !== 'pageFile')
          ) {
            return output
          }
        }
      }
      const dynamicRoutes = fsChecker.getDynamicRoutes()
      let curPathname = parsedUrl.pathname

      if (config.basePath) {
        if (!pathHasPrefix(curPathname || '', config.basePath)) {
          return
        }
        curPathname = curPathname?.substring(config.basePath.length) || '/'
      }
      const localeResult = fsChecker.handleLocale(curPathname || '')

      for (const route of dynamicRoutes) {
        // when resolving fallback: false the
        // render worker may return a no-fallback response
        // which signals we need to continue resolving.
        // TODO: optimize this to collect static paths
        // to use at the routing layer
        if (invokedOutputs?.has(route.page)) {
          continue
        }
        const params = route.match(localeResult.pathname)

        if (params) {
          const pageOutput = await fsChecker.getItem(
            addPathPrefix(route.page, config.basePath || '')
          )

          // i18n locales aren't matched for app dir
          if (
            pageOutput?.type === 'appFile' &&
            initialLocaleResult?.detectedLocale
          ) {
            continue
          }

          if (pageOutput && curPathname?.startsWith('/_next/data')) {
            addRequestMeta(req, 'isNextDataReq', true)
          }

          if (config.useFileSystemPublicRoutes || didRewrite) {
            return pageOutput
          }
        }
      }
    }

    const normalizers = {
      basePath:
        config.basePath && config.basePath !== '/'
          ? new BasePathPathnameNormalizer(config.basePath)
          : undefined,
      data: new NextDataPathnameNormalizer(fsChecker.buildId),
    }

    async function handleRoute(
      route: Route
    ): Promise<UnwrapPromise<ReturnType<typeof resolveRoutes>> | void> {
      let curPathname = parsedUrl.pathname || '/'

      if (config.i18n && route.internal) {
        const hadTrailingSlash = curPathname.endsWith('/')

        if (config.basePath) {
          curPathname = removePathPrefix(curPathname, config.basePath)
        }
        const hadBasePath = curPathname !== parsedUrl.pathname

        const localeResult = normalizeLocalePath(
          curPathname,
          config.i18n.locales
        )
        const isDefaultLocale = localeResult.detectedLocale === defaultLocale

        if (isDefaultLocale) {
          curPathname =
            localeResult.pathname === '/' && hadBasePath
              ? config.basePath
              : addPathPrefix(
                  localeResult.pathname,
                  hadBasePath ? config.basePath : ''
                )
        } else if (hadBasePath) {
          curPathname =
            curPathname === '/'
              ? config.basePath
              : addPathPrefix(curPathname, config.basePath)
        }

        if ((isDefaultLocale || hadBasePath) && hadTrailingSlash) {
          curPathname = maybeAddTrailingSlash(curPathname)
        }
      }
      let params = route.match(curPathname)

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
        if (
          fsChecker.exportPathMapRoutes &&
          route.name === 'before_files_end'
        ) {
          for (const exportPathMapRoute of fsChecker.exportPathMapRoutes) {
            const result = await handleRoute(exportPathMapRoute)

            if (result) {
              return result
            }
          }
        }

        if (route.name === 'middleware_next_data' && parsedUrl.pathname) {
          if (fsChecker.getMiddlewareMatchers()?.length) {
            let normalized = parsedUrl.pathname

            // Remove the base path if it exists.
            const hadBasePath = normalizers.basePath?.match(parsedUrl.pathname)
            if (hadBasePath && normalizers.basePath) {
              normalized = normalizers.basePath.normalize(normalized, true)
            }

            let updated = false
            if (normalizers.data.match(normalized)) {
              updated = true
              addRequestMeta(req, 'isNextDataReq', true)
              normalized = normalizers.data.normalize(normalized, true)
            }

            if (config.i18n) {
              const curLocaleResult = normalizeLocalePath(
                normalized,
                config.i18n.locales
              )

              if (curLocaleResult.detectedLocale) {
                addRequestMeta(req, 'locale', curLocaleResult.detectedLocale)
              }
            }

            // If we updated the pathname, and it had a base path, re-add the
            // base path.
            if (updated) {
              if (hadBasePath) {
                normalized =
                  normalized === '/'
                    ? config.basePath
                    : path.posix.join(config.basePath, normalized)
              }

              // Re-add the trailing slash (if required).
              normalized = maybeAddTrailingSlash(normalized)

              parsedUrl.pathname = normalized
            }
          }
        }

        if (route.name === 'check_fs') {
          const pathname = parsedUrl.pathname || '/'

          if (invokedOutputs?.has(pathname) || checkLocaleApi(pathname)) {
            return
          }
          const output = await fsChecker.getItem(pathname)

          if (
            output &&
            !(
              config.i18n &&
              initialLocaleResult?.detectedLocale &&
              pathHasPrefix(pathname, '/api')
            )
          ) {
            if (
              config.useFileSystemPublicRoutes ||
              didRewrite ||
              (output.type !== 'appFile' && output.type !== 'pageFile')
            ) {
              matchedOutput = output

              if (output.locale) {
                addRequestMeta(req, 'locale', output.locale)
              }
              return {
                parsedUrl,
                resHeaders,
                finished: true,
                matchedOutput,
              }
            }
          }
        }

        if (!opts.minimalMode && route.name === 'middleware') {
          const match = fsChecker.getMiddlewareMatchers()
          let maybeDecodedPathname = parsedUrl.pathname || '/'

          try {
            maybeDecodedPathname = decodeURIComponent(maybeDecodedPathname)
          } catch {
            /* non-fatal we can't decode so can't match it */
          }

          if (
            // @ts-expect-error BaseNextRequest stuff
            match?.(parsedUrl.pathname, req, parsedUrl.query) ||
            match?.(
              maybeDecodedPathname,
              // @ts-expect-error BaseNextRequest stuff
              req,
              parsedUrl.query
            )
          ) {
            if (ensureMiddleware) {
              await ensureMiddleware(req.url)
            }

            const serverResult =
              await renderServer?.initialize(renderServerOpts)

            if (!serverResult) {
              throw new Error(`Failed to initialize render server "middleware"`)
            }

            addRequestMeta(req, 'invokePath', '')
            addRequestMeta(req, 'invokeOutput', '')
            addRequestMeta(req, 'invokeQuery', {})
            addRequestMeta(req, 'middlewareInvoke', true)
            if (opts.dev) {
              addRequestMeta(
                req,
                'devRequestTimingMiddlewareStart',
                process.hrtime.bigint()
              )
            }
            debug('invoking middleware', req.url, req.headers)

            let middlewareRes: Response | undefined = undefined
            let bodyStream: ReadableStream | undefined = undefined
            try {
              try {
                await serverResult.requestHandler(req, res, parsedUrl)
              } catch (err: any) {
                if (!('result' in err) || !('response' in err.result)) {
                  throw err
                }
                middlewareRes = err.result.response as Response
                res.statusCode = middlewareRes.status

                if (middlewareRes.body) {
                  bodyStream = middlewareRes.body
                } else if (middlewareRes.status) {
                  bodyStream = new ReadableStream({
                    start(controller) {
                      controller.enqueue('')
                      controller.close()
                    },
                  })
                }
              } finally {
                if (opts.dev) {
                  addRequestMeta(
                    req,
                    'devRequestTimingMiddlewareEnd',
                    process.hrtime.bigint()
                  )
                }
              }
            } catch (e) {
              // If the client aborts before we can receive a response object
              // (when the headers are flushed), then we can early exit without
              // further processing.
              if (isAbortError(e)) {
                return {
                  parsedUrl,
                  resHeaders,
                  finished: true,
                }
              }
              throw e
            }

            if (res.closed || res.finished || !middlewareRes) {
              return {
                parsedUrl,
                resHeaders,
                finished: true,
              }
            }

            const middlewareHeaders = toNodeOutgoingHttpHeaders(
              middlewareRes.headers
            ) as Record<string, string | string[] | undefined>

            debug('middleware res', middlewareRes.status, middlewareHeaders)

            if (middlewareHeaders['x-middleware-override-headers']) {
              const overriddenHeaders: Set<string> = new Set()
              let overrideHeaders: string | string[] =
                middlewareHeaders['x-middleware-override-headers']

              if (typeof overrideHeaders === 'string') {
                overrideHeaders = overrideHeaders.split(',')
              }

              for (const key of overrideHeaders) {
                overriddenHeaders.add(key.trim())
              }
              delete middlewareHeaders['x-middleware-override-headers']

              // Delete headers.
              for (const key of Object.keys(req.headers)) {
                if (!overriddenHeaders.has(key)) {
                  delete req.headers[key]
                }
              }

              // Update or add headers.
              for (const key of overriddenHeaders.keys()) {
                const valueKey = 'x-middleware-request-' + key
                const newValue = middlewareHeaders[valueKey]
                const oldValue = req.headers[key]

                if (oldValue !== newValue) {
                  req.headers[key] = newValue === null ? undefined : newValue
                }
                delete middlewareHeaders[valueKey]
              }
            }

            if (
              !middlewareHeaders['x-middleware-rewrite'] &&
              !middlewareHeaders['x-middleware-next'] &&
              !middlewareHeaders['location']
            ) {
              middlewareHeaders['x-middleware-refresh'] = '1'
            }
            delete middlewareHeaders['x-middleware-next']

            for (const [key, value] of Object.entries({
              ...filterReqHeaders(middlewareHeaders, ipcForbiddenHeaders),
            })) {
              if (
                [
                  'content-length',
                  'x-middleware-rewrite',
                  'x-middleware-redirect',
                  'x-middleware-refresh',
                ].includes(key)
              ) {
                continue
              }

              // for set-cookie, the header shouldn't be added to the response
              // as it's only needed for the request to the middleware function.
              if (key === 'x-middleware-set-cookie') {
                req.headers[key] = value
                continue
              }

              if (value) {
                resHeaders[key] = value
                req.headers[key] = value
              }
            }

            if (middlewareHeaders['x-middleware-rewrite']) {
              const value = middlewareHeaders['x-middleware-rewrite'] as string
              const destination = getRelativeURL(value, initUrl)
              resHeaders['x-middleware-rewrite'] = destination

              parsedUrl = url.parse(destination, true)

              if (parsedUrl.protocol) {
                return {
                  parsedUrl,
                  resHeaders,
                  finished: true,
                }
              }

              if (config.i18n) {
                const curLocaleResult = normalizeLocalePath(
                  parsedUrl.pathname || '',
                  config.i18n.locales
                )

                if (curLocaleResult.detectedLocale) {
                  addRequestMeta(req, 'locale', curLocaleResult.detectedLocale)
                }
              }
            }

            if (middlewareHeaders['location']) {
              const value = middlewareHeaders['location'] as string

              // Only process Location header as a redirect if it has a proper redirect status
              // This prevents a Location header with non-redirect status from being treated as a redirect
              const isRedirectStatus = allowedStatusCodes.has(
                middlewareRes.status
              )

              if (isRedirectStatus) {
                // Process as redirect: update parsedUrl and convert to relative URL
                const rel = getRelativeURL(value, initUrl)
                resHeaders['location'] = rel
                parsedUrl = url.parse(rel, true)

                return {
                  parsedUrl,
                  resHeaders,
                  finished: true,
                  statusCode: middlewareRes.status,
                }
              } else {
                // Not a redirect: just pass through the Location header
                resHeaders['location'] = value

                return {
                  parsedUrl,
                  resHeaders,
                  finished: true,
                  bodyStream,
                  statusCode: middlewareRes.status,
                }
              }
            }

            if (middlewareHeaders['x-middleware-refresh']) {
              return {
                parsedUrl,
                resHeaders,
                finished: true,
                bodyStream,
                statusCode: middlewareRes.status,
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

          parsedDestination.pathname = normalizeRepeatedSlashes(
            parsedDestination.pathname
          )

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
          let rewriteParams = params

          const { parsedDestination } = prepareDestination({
            appendParamsToQuery: true,
            destination: route.destination,
            params: rewriteParams,
            query: parsedUrl.query,
          })

          // Check to see if this is a non-relative rewrite. If it is, we need
          // to check to see if it's an allowed origin to receive the rewritten
          // headers.
          const parsedDestinationOrigin = parsedDestination.origin
          const isAllowedOrigin = parsedDestinationOrigin
            ? config.experimental.clientParamParsingOrigins?.some((origin) =>
                new RegExp(origin).test(parsedDestinationOrigin)
              )
            : false

          // Set the rewrite headers only if this is a RSC request.
          if (
            req.headers[RSC_HEADER] === '1' &&
            (!parsedDestination.origin || isAllowedOrigin)
          ) {
            // We set the rewritten path and query headers on the response now
            // that we know that the it's not an external rewrite.
            if (parsedUrl.pathname !== parsedDestination.pathname) {
              res.setHeader(
                NEXT_REWRITTEN_PATH_HEADER,
                parsedDestination.pathname
              )
            }
            if (parsedUrl.search !== parsedDestination.search) {
              res.setHeader(
                NEXT_REWRITTEN_QUERY_HEADER,
                // remove the leading ? from the search
                parsedDestination.search.slice(1)
              )
            }
          }

          if (parsedDestination.protocol) {
            return {
              // @ts-expect-error custom ParsedUrl
              parsedUrl: parsedDestination,
              finished: true,
            }
          }

          if (config.i18n) {
            const curLocaleResult = normalizeLocalePath(
              removePathPrefix(parsedDestination.pathname, config.basePath),
              config.i18n.locales
            )

            if (curLocaleResult.detectedLocale) {
              addRequestMeta(req, 'locale', curLocaleResult.detectedLocale)
            }
          }
          didRewrite = true
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

    for (const route of routes) {
      const result = await handleRoute(route)
      if (result) {
        return result
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
