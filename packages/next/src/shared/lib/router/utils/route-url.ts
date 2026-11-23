import type { ParsedUrlQuery } from 'querystring'
import type { ParsedUrl } from './parse-url'
import type { UrlWithParsedQuery } from 'url'
import type { NextUrlWithParsedQuery } from '../../../../server/request-meta'
import {
  cloneRelativeURL,
  formatRelativeURL,
  parseRequestPath,
  tryParseRequestURL,
  type RelativeURL,
} from './relative-url'
import { searchParamsToUrlQuery, urlQueryToSearchParams } from './querystring'
import { formatUrl } from './format-url'

/**
 * Routing state is separate from the URL. `query` includes matched route params
 * and internal routing values that must not implicitly appear in req.url/asPath.
 * The URL's searchParams always describes its actual search string.
 */
export type RouteURL = (
  | { kind: 'relative'; url: RelativeURL }
  | { kind: 'absolute'; url: URL }
) & { query: ParsedUrlQuery }

export function parseRouteURL(input: string): RouteURL {
  if (input.startsWith('/')) {
    const url = parseRequestPath(input)
    return {
      kind: 'relative',
      url,
      query: searchParamsToUrlQuery(url.searchParams),
    }
  }
  const url = new URL(input)
  return {
    kind: 'absolute',
    url,
    query: searchParamsToUrlQuery(url.searchParams),
  }
}

export function tryParseRequestRouteURL(input: string): RouteURL | undefined {
  const url = tryParseRequestURL(input)
  return url
    ? { kind: 'relative', url, query: searchParamsToUrlQuery(url.searchParams) }
    : undefined
}

export function cloneRouteURL(route: RouteURL): RouteURL {
  const query = structuredClone(route.query)
  return route.kind === 'relative'
    ? { kind: 'relative', url: cloneRelativeURL(route.url), query }
    : { kind: 'absolute', url: new URL(route.url.href), query }
}

/** Serialize the routing state using the existing search-over-query precedence. */
export function formatRouteURL(route: RouteURL): string {
  const copy = cloneRouteURL(route)
  copy.url.search =
    route.url.search || urlQueryToSearchParams(route.query).toString()
  copy.url.hash = route.url.hash
  return copy.kind === 'relative' ? formatRelativeURL(copy.url) : copy.url.href
}

/** Adapt a custom server's legacy URL once at the request boundary. */
export function fromLegacyURL(legacy: NextUrlWithParsedQuery): RouteURL {
  // formatUrl reads the individual fields, so a stale href never overrides a
  // custom server's pathname/search. Its query overrides are preserved below.
  const route = parseRouteURL(formatUrl(legacy))
  route.query =
    typeof legacy.query === 'string'
      ? Object.fromEntries(new URLSearchParams(legacy.query))
      : { ...legacy.query }
  return route
}

/** Snapshot for public/custom-server APIs and the Pages client router. */
export function toLegacyURL(route: RouteURL): UrlWithParsedQuery & ParsedUrl {
  const url = route.url
  const absolute = route.kind === 'absolute' ? route.url : null
  const username = absolute?.username
  return {
    auth: username
      ? absolute.password
        ? `${username}:${absolute.password}`
        : username
      : null,
    hash: url.hash,
    host: absolute?.host ?? null,
    hostname: absolute?.hostname ?? null,
    href:
      route.kind === 'absolute' ? route.url.href : formatRelativeURL(route.url),
    pathname: url.pathname,
    path: url.pathname + url.search,
    port: absolute?.port ?? null,
    protocol: absolute?.protocol ?? null,
    query: { ...route.query },
    search: url.search,
    slashes: absolute
      ? absolute.href.slice(
          absolute.protocol.length,
          absolute.protocol.length + 2
        ) === '//'
      : null,
    origin: absolute?.origin,
  }
}
