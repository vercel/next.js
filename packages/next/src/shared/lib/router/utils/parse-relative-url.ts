import type { ParsedUrlQuery } from 'querystring'
import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

export interface ParsedRelativeUrl {
  hash: string
  href: string
  pathname: string
  query: ParsedUrlQuery
  search: string
  slashes: undefined
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
  const globalBase = new URL(
    typeof window === 'undefined' ? 'http://n' : getLocationOrigin()
  )

  const resolvedBase = base
    ? new URL(base, globalBase)
    : url.startsWith('.')
      ? new URL(
          typeof window === 'undefined' ? 'http://n' : window.location.href
        )
      : globalBase

  const { pathname, searchParams, search, hash, href, origin } = new URL(
    url,
    resolvedBase
  )

  if (origin !== globalBase.origin) {
    throw new Error(`invariant: invalid relative URL, router received ${url}`)
  }

  return {
    pathname,
    query: parseQuery ? searchParamsToUrlQuery(searchParams) : undefined,
    search,
    hash,
    href: href.slice(origin.length),
    // We don't know for relative URLs at this point since we set a custom, internal
    // base that isn't surfaced to users.
    slashes: undefined,
  }
}
