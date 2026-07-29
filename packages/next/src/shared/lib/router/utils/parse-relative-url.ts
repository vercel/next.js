import type { ParsedUrlQuery } from 'querystring'
import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

// Avoid constructing a URL for the common case where the input is already a
// normalized, path-only URL. Limit this to unreserved URL characters and path
// separators so the fast path does not need to reproduce WHATWG serialization.
const nonSimplePathRegex = /[^A-Za-z0-9._~/-]/
const serverBase = new URL('http://n')

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
  if (
    base === undefined &&
    url.charCodeAt(0) === 47 &&
    !url.includes('?') &&
    !url.includes('#') &&
    !url.includes('/.') &&
    !nonSimplePathRegex.test(url)
  ) {
    return {
      auth: null,
      host: null,
      hostname: null,
      pathname: url,
      port: null,
      protocol: null,
      query: parseQuery ? {} : undefined,
      search: '',
      hash: '',
      href: url,
      slashes: null,
    }
  }

  const globalBase =
    typeof window === 'undefined' ? serverBase : new URL(getLocationOrigin())

  const resolvedBase = base
    ? new URL(base, globalBase)
    : url.startsWith('.')
      ? new URL(
          typeof window === 'undefined' ? 'http://n' : window.location.href
        )
      : globalBase

  const { pathname, searchParams, search, hash, href, origin } = url.startsWith(
    '/'
  )
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
