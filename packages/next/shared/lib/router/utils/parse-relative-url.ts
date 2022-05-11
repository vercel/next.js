import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export function parseRelativeUrl(url: string, base?: string) {
  const isNotPathRelative = url.charAt(0) === '.'
  const globalBase = new URL(
    typeof window === 'undefined' ? 'http://n' : getLocationOrigin()
  )

  let resolvedBase = globalBase // default to base
  if (base) {
    resolvedBase = new URL(base, globalBase)
  } else if (isNotPathRelative) {
    resolvedBase = new URL(
      typeof window === 'undefined' ? 'http://n' : window.location.href
    )
  }

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
