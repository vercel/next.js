import type { ParsedUrlQuery } from 'querystring'
import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

export interface ParsedRelativeUrl {
  auth: string | null
  hash: string
  host: string | null
  hostname: string | null
  href: string
  pathname: string
  port: string | null
  protocol: string | null
  query: ParsedUrlQuery
  search: string
  slashes: null
}

// Pre-computed server-side base URL origin to avoid repeated URL construction.
// On the server, the base is always 'http://n' (a dummy origin).
const SERVER_ORIGIN = 'http://n'

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export function parseRelativeUrl(
  url: string,
  base?: string,
  parseQuery?: true
): ParsedRelativeUrl
export function parseRelativeUrl(
  url: string,
  base: string | undefined,
  parseQuery: false
): Omit<ParsedRelativeUrl, 'query'>
export function parseRelativeUrl(
  url: string,
  base?: string,
  parseQuery = true
): ParsedRelativeUrl | Omit<ParsedRelativeUrl, 'query'> {
  // Server fast path: most SSR calls have no base and url starts with '/'.
  // This avoids constructing 2-3 URL objects (globalBase, resolvedBase, final)
  // and instead constructs only 1.
  if (typeof window === 'undefined' && !base && url.startsWith('/')) {
    const parsed = new URL(`${SERVER_ORIGIN}${url}`)
    if (parsed.origin !== SERVER_ORIGIN) {
      throw new Error(
        `invariant: invalid relative URL, router received ${url}`
      )
    }
    return {
      auth: null,
      host: null,
      hostname: null,
      pathname: parsed.pathname,
      port: null,
      protocol: null,
      query: parseQuery
        ? searchParamsToUrlQuery(parsed.searchParams)
        : undefined,
      search: parsed.search,
      hash: parsed.hash,
      href: parsed.href.slice(SERVER_ORIGIN.length),
      slashes: null,
    }
  }

  const globalBase = new URL(
    typeof window === 'undefined' ? SERVER_ORIGIN : getLocationOrigin()
  )

  const resolvedBase = base
    ? new URL(base, globalBase)
    : url.startsWith('.')
      ? new URL(
          typeof window === 'undefined' ? SERVER_ORIGIN : window.location.href
        )
      : globalBase

  const { pathname, searchParams, search, hash, href, origin } =
    url.startsWith('/')
      ? // 'http://localhost:3000///' would be received as '///' in Node.js' IncomingMessage
        // See https://nodejs.org/api/http.html#messageurl
        // Not using `origin` to support other protocols
        new URL(`${resolvedBase.protocol}//${resolvedBase.host}${url}`)
      : new URL(url, resolvedBase)

  if (origin !== globalBase.origin) {
    throw new Error(`invariant: invalid relative URL, router received ${url}`)
  }

  return {
    auth: null,
    host: null,
    hostname: null,
    pathname,
    port: null,
    protocol: null,
    query: parseQuery ? searchParamsToUrlQuery(searchParams) : undefined,
    search,
    hash,
    href: href.slice(origin.length),
    // We don't know for relative URLs at this point since we set a custom, internal
    // base that isn't surfaced to users.
    slashes: null,
  }
}
