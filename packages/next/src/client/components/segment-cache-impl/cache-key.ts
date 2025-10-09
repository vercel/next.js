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
  // TODO: We should remove the hash from the href and track that separately.
  // There's no reason to vary route entries by hash.
  const originalUrl = new URL(originalHref)
  const cacheKey = {
    href: originalHref as NormalizedHref,
    search: originalUrl.search as NormalizedSearch,
    nextUrl: nextUrl as NormalizedNextUrl | null,
  } as RouteCacheKey
  return cacheKey
}
