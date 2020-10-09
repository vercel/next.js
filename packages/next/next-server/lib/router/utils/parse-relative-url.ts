import { searchParamsToUrlQuery } from './querystring'

/**
 * Parses path-relative urls (e.g. `/hello/world?foo=bar`).
 */
export function parseRelativeUrl(url: string) {
  const fakeOrigin = 'http://n'
  const { pathname, searchParams, search, hash, href, origin } = new URL(
    url,
    fakeOrigin
  )

  if (origin !== fakeOrigin) {
    throw new Error('invariant: invalid relative URL')
  }

  return {
    pathname,
    query: searchParamsToUrlQuery(searchParams),
    search,
    hash,
    href: href.slice(fakeOrigin.length),
  }
}
