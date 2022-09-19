import type { ParsedUrlQuery } from 'querystring'
import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

export interface ParsedRelativeUrl {
  hash: string
  href: string
  pathname: string
  query: ParsedUrlQuery
  search: string
}

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export function parseRelativeUrl(
  url: string,
  base?: string
): ParsedRelativeUrl {
  const globalBase = new URL(
    process.env.NEXT_RUNTIME ? 'http://n' : getLocationOrigin()
  )

  const resolvedBase = base
    ? new URL(base, globalBase)
    : url.startsWith('.')
    ? new URL(!!process.env.NEXT_RUNTIME ? 'http://n' : window.location.href)
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
    query: searchParamsToUrlQuery(searchParams),
    search,
    hash,
    href: href.slice(globalBase.origin.length),
  }
}
