import type { IncomingHttpHeaders } from 'node:http'
import type { ParsedUrlQuery } from 'querystring'
import { match } from 'next/dist/compiled/path-to-regexp'
import {
  matchHas,
  prepareDestination,
} from '../../../shared/lib/router/utils/prepare-destination'
import { PHASE_PRODUCTION_BUILD } from '../../../shared/lib/constants'
import { buildCustomRoute } from '../../../lib/build-custom-route'
import loadCustomRoutes from '../../../lib/load-custom-routes'
import { normalizeConfig, type NextConfig } from '../../../server/config-shared'
import { NextResponse } from '../../../server/web/exports'
import { getRedirectStatus } from '../../../lib/redirect-status'
import type {
  ManifestHeaderRoute,
  ManifestRedirectRoute,
  ManifestRewriteRoute,
} from '../../../build'
import type { BaseNextRequest } from '../../../server/base-http'
import type { Params } from '../../../server/request/params'
import { constructRequest } from './utils'
import { parsedUrlQueryToParams } from '../../../server/route-modules/app-route/helpers/parsed-url-query-to-params'
import { searchParamsToUrlQuery } from '../../../shared/lib/router/utils/querystring'

/**
 * The subset of the legacy `url.parse(url, true)` result that route matching
 * needs. Constructing it from the WHATWG `URL` API avoids the deprecated
 * `url.parse()` (DEP0169). Relative URLs keep `protocol`/`host` as null,
 * matching the legacy behavior.
 */
interface ParsedRequestUrl {
  pathname: string
  query: ParsedUrlQuery
  protocol: string | null
  host: string | null
}

function parseRequestUrl(url: string): ParsedRequestUrl {
  const isAbsolute = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)
  const parsed = new URL(url, 'https://example.com')
  return {
    pathname: parsed.pathname,
    query: searchParamsToUrlQuery(parsed.searchParams),
    protocol: isAbsolute ? parsed.protocol : null,
    host: isAbsolute ? parsed.host : null,
  }
}

/**
 * Tries to match the current request against the provided route. If there is
 * a match, it returns the params extracted from the path. If not, it returns
 * undefined.
 */
function matchRoute(
  route: ManifestHeaderRoute | ManifestRedirectRoute | ManifestRewriteRoute,
  request: BaseNextRequest,
  parsedUrl: ParsedRequestUrl
): Params | undefined {
  const pathname = parsedUrl.pathname
  if (!pathname) {
    return
  }
  const regexMatches = pathname?.match(route.regex)

  if (regexMatches) {
    const pathMatch = match<Params>(route.source)(pathname)
    if (!pathMatch) {
      throw new Error(
        'Unexpected error: extracting params from path failed but the regular expression matched'
      )
    }
    if (route.has || route.missing) {
      if (!matchHas(request, parsedUrl.query, route.has, route.missing)) {
        return
      }
    }
    return pathMatch.params
  }
}

/**
 * Tests the logic of `headers`, `redirects`, and `rewrites` in `next.config.js`.
 * Given the provided next config, this function will return a `NextResponse`
 * with the result of running the request through the custom routes.
 *
 * @example Test whether a given URL results in a redirect.
 * ```
 * import { unstable_getResponseFromNextConfig, getRedirectUrl } from 'next/server/testing'
 * const response = await unstable_getResponseFromNextConfig({
 *   url: 'https://nextjs.org/test',
 *   nextConfig: {
 *    async redirects() {
 *     return [
 *       { source: '/test', destination: '/test2', permanent: false },
 *     ]
 *    },
 *   }
 * });
 * expect(response.status).toEqual(307);
 * expect(getRedirectUrl(response)).toEqual('https://nextjs.org/test2');
 * ```
 */
export async function unstable_getResponseFromNextConfig({
  url,
  nextConfig,
  headers = {},
  cookies = {},
}: {
  url: string
  nextConfig:
    | NextConfig
    | ((...args: any[]) => NextConfig | Promise<NextConfig>)
  headers?: IncomingHttpHeaders
  cookies?: Record<string, string>
}): Promise<NextResponse> {
  const parsedUrl = parseRequestUrl(url)
  const request = constructRequest({ url, headers, cookies })
  const resolvedConfig = await normalizeConfig(
    PHASE_PRODUCTION_BUILD,
    nextConfig
  )
  const routes = await loadCustomRoutes(resolvedConfig)

  const headerRoutes = routes.headers.map((route) =>
    buildCustomRoute('header', route)
  )
  const redirectRoutes = routes.redirects.map((route) =>
    buildCustomRoute('redirect', route, ['/_next/'])
  )
  const rewriteRoutes = [
    ...routes.rewrites.beforeFiles,
    ...routes.rewrites.afterFiles,
    ...routes.rewrites.fallback,
  ].map((route) => buildCustomRoute('rewrite', route))

  const respHeaders: Record<string, string> = {}
  for (const route of headerRoutes) {
    const matched = matchRoute(route, request, parsedUrl)
    if (matched) {
      for (const header of route.headers) {
        respHeaders[header.key] = header.value
      }
    }
  }
  function matchRouteAndGetDestination(
    route: ManifestRedirectRoute | ManifestRewriteRoute
  ): URL | undefined {
    const params = matchRoute(route, request, parsedUrl)
    if (!params) {
      return
    }
    const { newUrl, parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params,
      query: parsedUrl.query,
    })
    const searchParams = new URLSearchParams(
      parsedUrlQueryToParams(parsedDestination.query) as Record<string, string>
    )
    return new URL(
      searchParams.size > 0 ? `${newUrl}?${searchParams.toString()}` : newUrl,
      parsedDestination.hostname
        ? `${parsedDestination.protocol}//${parsedDestination.hostname}`
        : parsedUrl.host
          ? `${parsedUrl.protocol}//${parsedUrl.host}`
          : 'https://example.com'
    )
  }
  for (const route of redirectRoutes) {
    const redirectUrl = matchRouteAndGetDestination(route)
    if (!redirectUrl) {
      continue
    }
    const statusCode = getRedirectStatus(route)
    return NextResponse.redirect(redirectUrl, {
      status: statusCode,
      headers: respHeaders,
    })
  }
  for (const route of rewriteRoutes) {
    const rewriteUrl = matchRouteAndGetDestination(route)
    if (!rewriteUrl) {
      continue
    }
    return NextResponse.rewrite(rewriteUrl, {
      headers: respHeaders,
    })
  }
  return new NextResponse('', { status: 200, headers: respHeaders })
}
