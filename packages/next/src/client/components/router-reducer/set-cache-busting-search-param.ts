'use client'

import { computeCacheBustingSearchParam } from '../../../shared/lib/router/utils/cache-busting-search-param'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  NEXT_RSC_UNION_QUERY,
} from '../app-router-headers'
import type { RequestHeaders } from './fetch-server-response'

/**
 * Mutates the provided URL by adding a cache-busting search parameter for CDNs that don't
 * support custom headers. This helps avoid caching conflicts by making each request unique.
 *
 * Rather than relying on the Vary header which some CDNs ignore, we append a search param
 * to create a unique URL that forces a fresh request.
 *
 * Example:
 * URL before: https://example.com/path?query=1
 * URL after: https://example.com/path?query=1&_rsc=abc123
 *
 * Note: This function mutates the input URL directly and does not return anything.
 *
 * TODO: Since we need to use a search param anyway, we could simplify by removing the custom
 * headers approach entirely and just use search params.
 */
export const setCacheBustingSearchParam = (
  url: URL,
  headers: RequestHeaders
): void => {
  const uniqueCacheKey = computeCacheBustingSearchParam(
    headers[NEXT_ROUTER_PREFETCH_HEADER],
    headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER],
    headers[NEXT_ROUTER_STATE_TREE_HEADER],
    headers[NEXT_URL]
  )
  setCacheBustingSearchParamWithHash(url, uniqueCacheKey)
}

/**
 * Sets a cache-busting search parameter on a URL using a provided hash value.
 *
 * This function performs the same logic as `setCacheBustingSearchParam` but accepts
 * a pre-computed hash instead of computing it from headers.
 *
 * Example:
 * URL before: https://example.com/path?query=1
 * hash: "abc123"
 * URL after: https://example.com/path?query=1&_rsc=abc123
 *
 * If the hash is null, we will set `_rsc` search param without a value.
 * Like this: https://example.com/path?query=1&_rsc
 *
 * Note: This function mutates the input URL directly and does not return anything.
 */
export const setCacheBustingSearchParamWithHash = (
  url: URL,
  hash: string
): void => {
  /**
   * Note that we intentionally do not use `url.searchParams.set` here:
   *
   * const url = new URL('https://example.com/search?q=custom%20spacing');
   * url.searchParams.set('_rsc', 'abc123');
   * console.log(url.toString()); // Outputs: https://example.com/search?q=custom+spacing&_rsc=abc123
   *                                                                             ^ <--- this is causing confusion
   * This is in fact intended based on https://url.spec.whatwg.org/#interface-urlsearchparams, but
   * we want to preserve the %20 as %20 if that's what the user passed in, hence the custom
   * logic below.
   */
  const existingSearch = url.search
  const rawQuery = existingSearch.startsWith('?')
    ? existingSearch.slice(1)
    : existingSearch

  // Always remove any existing cache busting param and add a fresh one to ensure
  // we have the correct value based on current request headers
  const pairs = rawQuery
    .split('&')
    .filter((pair) => pair && !pair.startsWith(`${NEXT_RSC_UNION_QUERY}=`))

  if (hash.length > 0) {
    pairs.push(`${NEXT_RSC_UNION_QUERY}=${hash}`)
  } else {
    pairs.push(`${NEXT_RSC_UNION_QUERY}`)
  }
  url.search = pairs.length ? `?${pairs.join('&')}` : ''
}
