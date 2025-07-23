import { NEXT_REWRITTEN_QUERY_HEADER } from '../app-router-headers'
import type { RSCResponse } from '../router-reducer/fetch-server-response'

// TypeScript trick to simulate opaque types, like in Flow.
type Opaque<K, T> = T & { __brand: K }

// Only functions in this module should be allowed to create CacheKeys.
export type NormalizedHref = Opaque<'NormalizedHref', string>
export type NormalizedSearch = Opaque<'NormalizedSearch', string>
export type NormalizedNextUrl = Opaque<'NormalizedNextUrl', string>

export type RouteCacheKey = Opaque<
  'RouteCacheKey',
  {
    href: NormalizedHref
    search: NormalizedSearch
    nextUrl: NormalizedNextUrl | null

    // TODO: Eventually the dynamic params will be added here, too.
  }
>

export function createCacheKey(
  originalHref: string,
  nextUrl: string | null
): RouteCacheKey {
  const originalUrl = new URL(originalHref)
  const cacheKey = {
    href: originalHref as NormalizedHref,
    search: originalUrl.search as NormalizedSearch,
    nextUrl: nextUrl as NormalizedNextUrl | null,
  } as RouteCacheKey
  return cacheKey
}

export function getRenderedSearch(response: RSCResponse): NormalizedSearch {
  // If the server performed a rewrite, the search params used to render the
  // page will be different from the params in the request URL. In this case,
  // the response will include a header that gives the rewritten search query.
  const rewrittenQuery = response.headers.get(NEXT_REWRITTEN_QUERY_HEADER)
  if (rewrittenQuery !== null) {
    return (
      rewrittenQuery === '' ? '' : '?' + rewrittenQuery
    ) as NormalizedSearch
  }
  // If the header is not present, there was no rewrite, so we use the search
  // query of the response URL.
  return new URL(response.url).search as NormalizedSearch
}
