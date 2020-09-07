import { getLocationOrigin } from '../../utils'
import { searchParamsToUrlQuery } from './querystring'

const DUMMY_BASE = new URL(
  typeof window === 'undefined' ? 'http://n' : getLocationOrigin()
)

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`). If url isn't path-relative
 * (e.g. `./hello`) then at least base must be.
 * Absolute urls are rejected with one exception, in the browser, absolute urls that are on
 * the current origin will be parsed as relative
 */
export function parseRelativeUrl(url: string, base?: string) {
  const resolvedBase = base ? new URL(base, DUMMY_BASE) : DUMMY_BASE
  const {
    pathname,
    searchParams,
    search,
    hash,
    href,
    origin,
    protocol,
  } = new URL(url, resolvedBase)
  if (
    origin !== DUMMY_BASE.origin ||
    (protocol !== 'http:' && protocol !== 'https:')
  ) {
    throw new Error('invariant: invalid relative URL')
  }
  return {
    pathname,
    query: searchParamsToUrlQuery(searchParams),
    search,
    hash,
    href: href.slice(DUMMY_BASE.origin.length),
  }
}
