import type { ParsedUrlQuery } from 'querystring'
import type { ParsedUrl } from './parse-url'
import type { DeepReadonly } from '../../deep-readonly'
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
  const search =
    route.url.search || urlQueryToSearchParams(route.query).toString()
  if (route.kind === 'absolute') {
    const url = new URL(route.url.href)
    url.search = search
    url.hash = route.url.hash
    return url.href
  }
  const url = cloneRelativeURL(route.url)
  url.search = search
  url.hash = route.url.hash
  return formatRelativeURL(url)
}

/** Adapt a custom server's legacy URL once at the request boundary. */
export type LegacyRouteURL = Partial<Omit<NextUrlWithParsedQuery, 'query'>> & {
  query: ParsedUrlQuery | string | null
}

export function normalizeRouteURL(input: RouteURL | LegacyRouteURL): RouteURL {
  return 'url' in input ? input : fromLegacyURL(input)
}

export function fromLegacyURL(legacy: DeepReadonly<LegacyRouteURL>): RouteURL {
  // formatUrl reads the individual fields, so a stale href never overrides a
  // custom server's pathname/search. Its query overrides are preserved below.
  const query: ParsedUrlQuery = {}
  if (typeof legacy.query === 'string') {
    Object.assign(query, Object.fromEntries(new URLSearchParams(legacy.query)))
  } else {
    for (const [key, value] of Object.entries(legacy.query || {})) {
      query[key] =
        typeof value === 'string' || value === undefined ? value : [...value]
    }
  }
  const formatted = formatUrl({
    ...legacy,
    query: typeof legacy.query === 'string' ? legacy.query : query,
  })
  // Public render404 callers can provide only a query, without a pathname.
  const route = parseRouteURL(
    !formatted || formatted.startsWith('?') || formatted.startsWith('#')
      ? '/' + formatted
      : formatted
  )
  route.query = query
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
