// TypeScript trick to simulate opaque types, like in Flow.
type Opaque<K, T> = T & { __brand: K }

// Only functions in this module should be allowed to create CacheKeys.
export type NormalizedPathname = Opaque<'NormalizedPathname', string>
export type NormalizedSearch = Opaque<'NormalizedSearch', string>
export type NormalizedNextUrl = Opaque<'NormalizedNextUrl', string>

export type RouteCacheKey = Opaque<
  'RouteCacheKey',
  {
    pathname: NormalizedPathname
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
    pathname: originalUrl.pathname as NormalizedPathname,
    search: originalUrl.search as NormalizedSearch,
    nextUrl: nextUrl as NormalizedNextUrl | null,
  } as RouteCacheKey
  return cacheKey
}
