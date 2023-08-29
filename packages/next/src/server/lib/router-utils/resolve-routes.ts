import type { TLSSocket } from 'tls'
import type { FsOutput } from './filesystem'
import type { IncomingMessage } from 'http'
import type { DomainLocale, NextConfigComplete } from '../../config-shared'
import type { RenderWorker, initialize } from '../router-server'

import url from 'url'
import { Redirect } from '../../../../types'
import setupDebug from 'next/dist/compiled/debug'
import { getCloneableBody } from '../../body-streams'
import { filterReqHeaders, ipcForbiddenHeaders } from '../server-ipc/utils'
import { Header } from '../../../lib/load-custom-routes'
import { stringifyQuery } from '../../server-route-utils'
import { formatHostname } from '../format-hostname'
import { toNodeOutgoingHttpHeaders } from '../../web/utils'
import { invokeRequest } from '../server-ipc/invoke-request'
import { isAbortError } from '../../pipe-readable'
import { getCookieParser, setLazyProp } from '../../api-utils'
import { getHostname } from '../../../shared/lib/get-hostname'
import { UnwrapPromise } from '../../../lib/coalesced-function'
import { getRedirectStatus } from '../../../lib/redirect-status'
import { normalizeRepeatedSlashes } from '../../../shared/lib/utils'
import { getPathMatch } from '../../../shared/lib/router/utils/path-match'
import { relativizeURL } from '../../../shared/lib/router/utils/relativize-url'
import { addPathPrefix } from '../../../shared/lib/router/utils/add-path-prefix'

import {
  NextUrlWithParsedQuery,
  addRequestMeta,
  getRequestMeta,
} from '../../request-meta'
import {
  compileNonPath,
  matchHas,
  prepareDestination,
} from '../../../shared/lib/router/utils/prepare-destination'
import {
  I18NProvider,
  LocaleAnalysisResult,
} from '../../future/helpers/i18n-provider'
import { PathPrefixNormalizer } from '../../future/normalizers/path-prefix-normalizer'
import { TrailingSlashNormalizer } from '../../future/normalizers/trailing-slash-normalizer'
import { isAPIRoute } from '../../../lib/is-api-route'

const debug = setupDebug('next:router-server:resolve-routes')

export function getResolveRoutes(
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >,
  config: NextConfigComplete,
  opts: Parameters<typeof initialize>[0],
  renderWorkers: {
    app?: RenderWorker
    pages?: RenderWorker
  },
  renderWorkerOpts: Parameters<RenderWorker['initialize']>[0],
  ensureMiddleware?: () => Promise<void>
) {
  const routes: ({
    match: ReturnType<typeof getPathMatch>
    check?: boolean
    name?: string
    internal?: boolean
  } & Partial<Header> &
    Partial<Redirect>)[] = [
    // _next/data with middleware handling
    { match: () => ({} as any), name: 'middleware_next_data' },

    ...(opts.minimalMode ? [] : fsChecker.headers),
    ...(opts.minimalMode ? [] : fsChecker.redirects),

    // check middleware (using matchers)
    { match: () => ({} as any), name: 'middleware' },

    ...(opts.minimalMode ? [] : fsChecker.rewrites.beforeFiles),

    // check middleware (using matchers)
    { match: () => ({} as any), name: 'before_files_end' },

    // we check exact matches on fs before continuing to
    // after files rewrites
    { match: () => ({} as any), name: 'check_fs' },

    ...(opts.minimalMode ? [] : fsChecker.rewrites.afterFiles),

    // we always do the check: true handling before continuing to
    // fallback rewrites
    {
      check: true,
      match: () => ({} as any),
      name: 'after files check: true',
    },

    ...(opts.minimalMode ? [] : fsChecker.rewrites.fallback),
  ]

  const i18n = config.i18n ? new I18NProvider(config.i18n) : undefined
  const basePath =
    config.basePath && config.basePath.length > 1
      ? new PathPrefixNormalizer(config.basePath)
      : undefined
  const trailingSlash =
    config.trailingSlash && !config.skipMiddlewareUrlNormalize
      ? new TrailingSlashNormalizer()
      : undefined

  async function resolveRoutes({
    req,
    isUpgradeReq,
    signal,
    invokedOutputs,
  }: {
    req: IncomingMessage
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
    let resHeaders: Record<string, string | string[]> = {}
    let parsedUrl = url.parse(req.url || '', true) as NextUrlWithParsedQuery
    let didRewrite = false

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
    const protocol =
      (req?.socket as TLSSocket)?.encrypted ||
      req.headers['x-forwarded-proto'] === 'https'
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

    addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
    addRequestMeta(req, '_protocol', protocol)
    setLazyProp({ req }, 'cookies', () => getCookieParser(req.headers)())

    if (!isUpgradeReq) {
      addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req))
    }

    let domainLocale: DomainLocale | undefined
    let defaultLocale: string | undefined
    let initialLocaleResult: LocaleAnalysisResult | undefined

    if (i18n) {
      let curPathname = parsedUrl.pathname || '/'

      // Remove the basePath from the pathname if it exists.
      if (basePath) {
        curPathname = basePath.normalize(curPathname)
      }

      // Detect the domain locale from the hostname on the request.
      domainLocale = i18n.detectDomainLocale(getHostname(parsedUrl))

      // Infer the default locale from the default locale (if any) or fallback
      // to the default locale.
      defaultLocale = domainLocale?.defaultLocale || i18n.config.defaultLocale

      // Analyze the pathname to detect the locale or fallback to the default
      // locale if none was detected.
      initialLocaleResult = i18n.analyze(curPathname, { defaultLocale })

      // Add the locale information onto the URL.
      parsedUrl.query.__nextLocale = initialLocaleResult.detectedLocale
      parsedUrl.query.__nextDefaultLocale = defaultLocale
      parsedUrl.query.__nextInferredLocaleFromDefault =
        initialLocaleResult.inferredFromDefault ? '1' : undefined
    }

    async function checkTrue() {
      let curPathname = parsedUrl.pathname || '/'

      if (basePath) {
        const info = basePath.analyze(curPathname)

        // As the basePath has been configured and this request does not have
        // the basePath prefix, we can skip the rest of the checks.
        if (!info.hadPrefix) return null

        curPathname = info.pathname
      }

      // If we've already tried this pathname, we can skip the rest of the
      // checks.
      if (invokedOutputs?.has(curPathname)) return

      let output = await fsChecker.getItem(curPathname)
      if (
        output &&
        (config.useFileSystemPublicRoutes ||
          didRewrite ||
          (output.type !== 'appFile' && output.type !== 'pageFile'))
      ) {
        return output
      }

      const localeResult = i18n?.analyze(curPathname) ?? {
        pathname: curPathname,
      }

      const dynamicRoutes = fsChecker.getDynamicRoutes()

      for (const route of dynamicRoutes) {
        // when resolving fallback: false the
        // render worker may return a no-fallback response
        // which signals we need to continue resolving.
        // TODO: optimize this to collect static paths
        // to use at the routing layer

        if (invokedOutputs?.has(route.page)) {
          continue
        }

        // Try to match this pathname against the route.
        const params = route.match(
          route.supportsLocales ? localeResult.pathname : curPathname
        )

        // The route did not match the current pathname.
        if (!params) continue

        output = await fsChecker.getItem(route.page)

        // If the filesystem public routes are not enabled and we haven't
        // already rewritten, we should skip this route.
        if (!config.useFileSystemPublicRoutes && !didRewrite) continue

        // Set the data parameter on the request.
        if (output && curPathname.startsWith('/_next/data')) {
          parsedUrl.query.__nextDataReq = '1'
        }

        return output
      }
    }

    async function handleRoute(
      route: (typeof routes)[0]
    ): Promise<UnwrapPromise<ReturnType<typeof resolveRoutes>> | void> {
      let matchPathname = parsedUrl.pathname || '/'

      if (i18n && route.internal) {
        // When the pathname is not the root pathname and ends with a slash we
        // need to add it back after we've updated the locales.
        const hadTrailingSlash =
          matchPathname !== '/' && matchPathname.endsWith('/')

        // Remove the basePath from the pathname if it has one.
        let hadBasePath = false
        if (basePath) {
          const info = basePath.analyze(matchPathname)
          if (info.hadPrefix) {
            matchPathname = info.pathname
            hadBasePath = true
          }
        }

        // Analyze the pathname to detect the locale or fallback to the default
        // locale if none was detected.
        const localeResult = i18n.analyze(matchPathname, { defaultLocale })

        // For the default locale, we use the pathname where the locale has
        // been stripped.
        if (localeResult.detectedLocale === defaultLocale) {
          matchPathname = localeResult.pathname
        }

        // Add the base path back if it was removed.
        if (basePath && hadBasePath) {
          matchPathname = basePath.denormalize(matchPathname)
        }

        // Add the trailing slash back if it was removed.
        if (hadTrailingSlash && trailingSlash) {
          matchPathname = trailingSlash.normalize(matchPathname)
        }
      }

      // Try to match to see if this route applies to this pathname.
      const params = route.match(matchPathname)

      // If there was no params, this route does not apply to this request.
      if (!params) return

      // If the route has any `has` or `missing` parameters, we should check
      // if the request has those parameters before continuing.
      if (route.has || route.missing) {
        // Get any parameters that could be extracted from this request.
        const hasParams = matchHas(
          req,
          parsedUrl.query,
          route.has,
          route.missing
        )

        // One of the checks failed, this route doesn't match.
        if (!hasParams) return

        // Assign these parameters to the params object.
        Object.assign(params, hasParams)
      }

      if (fsChecker.interceptionRoutes && route.name === 'before_files_end') {
        for (const interceptionRoute of fsChecker.interceptionRoutes) {
          const result = await handleRoute(interceptionRoute)

          if (result) {
            return result
          }
        }
      }

      if (route.name === 'middleware_next_data') {
        if (fsChecker.getMiddlewareMatchers()?.length) {
          const nextDataPrefix = addPathPrefix(
            `/_next/data/${fsChecker.buildId}/`,
            config.basePath
          )

          if (
            parsedUrl.pathname?.startsWith(nextDataPrefix) &&
            parsedUrl.pathname.endsWith('.json')
          ) {
            parsedUrl.query.__nextDataReq = '1'
            parsedUrl.pathname = parsedUrl.pathname.substring(
              nextDataPrefix.length - 1
            )
            parsedUrl.pathname = parsedUrl.pathname.substring(
              0,
              parsedUrl.pathname.length - '.json'.length
            )
            parsedUrl.pathname = addPathPrefix(
              parsedUrl.pathname,
              config.basePath
            )
            parsedUrl.pathname =
              parsedUrl.pathname === '/index' ? '/' : parsedUrl.pathname

            if (trailingSlash) {
              parsedUrl.pathname = trailingSlash.normalize(parsedUrl.pathname)
            }
          }
        }
      }

      if (route.name === 'check_fs' && parsedUrl.pathname) {
        let curPathname = parsedUrl.pathname
        if (basePath) {
          curPathname = basePath.normalize(curPathname)
        }

        const output = await fsChecker.getItem(curPathname)

        if (
          output &&
          !(
            config.i18n &&
            initialLocaleResult?.detectedLocale &&
            parsedUrl.pathname &&
            isAPIRoute(parsedUrl.pathname)
          )
        ) {
          if (
            config.useFileSystemPublicRoutes ||
            didRewrite ||
            (output.type !== 'appFile' && output.type !== 'pageFile')
          ) {
            if (output.locale) {
              parsedUrl.query.__nextLocale = output.locale
            }
            return {
              parsedUrl,
              resHeaders,
              finished: true,
              matchedOutput: output,
            }
          }
        }
      }

      if (!opts.minimalMode && route.name === 'middleware') {
        const match = fsChecker.getMiddlewareMatchers()
        if (
          // @ts-expect-error BaseNextRequest stuff
          match?.(parsedUrl.pathname, req, parsedUrl.query) &&
          (!ensureMiddleware ||
            (await ensureMiddleware?.()
              .then(() => true)
              .catch(() => false)))
        ) {
          const workerResult = await (
            renderWorkers.app || renderWorkers.pages
          )?.initialize(renderWorkerOpts)

          if (!workerResult) {
            throw new Error(`Failed to initialize render worker "middleware"`)
          }
          const stringifiedQuery = stringifyQuery(
            req as any,
            getRequestMeta(req, '__NEXT_INIT_QUERY') || {}
          )
          const parsedInitUrl = new URL(
            getRequestMeta(req, '__NEXT_INIT_URL') || '/',
            'http://n'
          )

          const curUrl = config.skipMiddlewareUrlNormalize
            ? `${parsedInitUrl.pathname}${parsedInitUrl.search}`
            : `${parsedUrl.pathname}${stringifiedQuery ? '?' : ''}${
                stringifiedQuery || ''
              }`

          const renderUrl = `http://${workerResult.hostname}:${workerResult.port}${curUrl}`

          const invokeHeaders: typeof req.headers = {
            ...req.headers,
            'x-invoke-path': '',
            'x-invoke-query': '',
            'x-invoke-output': '',
            'x-middleware-invoke': '1',
          }

          debug('invoking middleware', renderUrl, invokeHeaders)

          let middlewareRes
          try {
            middlewareRes = await invokeRequest(
              renderUrl,
              {
                headers: invokeHeaders,
                method: req.method,
                signal,
              },
              getRequestMeta(req, '__NEXT_CLONABLE_BODY')?.cloneBodyStream()
            )
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
                'x-middleware-invoke',
                'x-invoke-path',
                'x-invoke-query',
              ].includes(key)
            ) {
              continue
            }
            if (value) {
              resHeaders[key] = value
              req.headers[key] = value
            }
          }

          if (middlewareHeaders['x-middleware-rewrite']) {
            const value = middlewareHeaders['x-middleware-rewrite'] as string
            const rel = relativizeURL(value, initUrl)
            resHeaders['x-middleware-rewrite'] = rel

            const query = parsedUrl.query
            parsedUrl = url.parse(rel, true)

            if (parsedUrl.protocol) {
              return {
                parsedUrl,
                resHeaders,
                finished: true,
              }
            }

            // keep internal query state
            for (const key of Object.keys(query)) {
              if (key.startsWith('_next') || key.startsWith('__next')) {
                parsedUrl.query[key] = query[key]
              }
            }

            // If the locale was rewritten on the request, then we should
            // update the query to include the locale.
            if (i18n && parsedUrl.pathname) {
              const curLocaleResult = i18n.analyze(parsedUrl.pathname || '')
              if (curLocaleResult.detectedLocale) {
                parsedUrl.query.__nextLocale = curLocaleResult.detectedLocale
              }
            }
          }

          if (middlewareHeaders['location']) {
            const value = middlewareHeaders['location'] as string
            const rel = relativizeURL(value, initUrl)
            resHeaders['location'] = rel
            parsedUrl = url.parse(rel, true)

            return {
              parsedUrl,
              resHeaders,
              finished: true,
              statusCode: middlewareRes.status,
            }
          }

          if (middlewareHeaders['x-middleware-refresh']) {
            return {
              parsedUrl,
              resHeaders,
              finished: true,
              bodyStream: middlewareRes.body,
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
          // TODO: fix the types for prepareDestination or correct the value
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

        // If localization was enabled, we should detect the locale from the
        // destination path and update the query to include the locale.
        if (i18n) {
          let curDestinationPathname = parsedDestination.pathname || '/'

          // Strip the base path from the pathname if it exists.
          if (basePath) {
            curDestinationPathname = basePath.normalize(curDestinationPathname)
          }

          // Detect the locale from the pathname if it exists, otherwise it'll
          // stick with the current locale on the request.
          const curLocaleResult = i18n.analyze(curDestinationPathname)

          // If the locale was detected on the route and it was not inferred
          // from the default locale, then we should update it on the query.
          if (curLocaleResult.detectedLocale) {
            // Update the locale to the detected locale.
            parsedUrl.query.__nextLocale = curLocaleResult.detectedLocale
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

    for (const route of routes) {
      const result = await handleRoute(route)

      // If the route was not handled, continue to the next route.
      if (!result) continue

      return result
    }

    return {
      finished: false,
      parsedUrl,
      resHeaders,
      matchedOutput: null,
    }
  }

  return resolveRoutes
}
