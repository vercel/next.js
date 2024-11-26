// TypeScript trick to simulate opaque types, like in Flow.
type Opaque<K, T> = T & { __brand: K }

// Only functions in this module should be allowed to create CacheKeys.
export type RouteCacheKeyId = Opaque<'RouteCacheKeyId', string>
export type NormalizedHref = Opaque<'NormalizedHref', string>
type NormalizedNextUrl = Opaque<'NormalizedNextUrl', string>

export type RouteCacheKey = Opaque<
  'RouteCacheKey',
  {
    id: RouteCacheKeyId
    href: NormalizedHref
    nextUrl: NormalizedNextUrl | null
  }
>

export function createCacheKey(
  originalHref: string,
  nextUrl: string | null
): RouteCacheKey {
  const originalUrl = new URL(originalHref)

  // TODO: As of now, we never include search params in the cache key because
  // per-segment prefetch requests are always static, and cannot contain search
  // params. But to support <Link prefetch={true}>, we will sometimes populate
  // the cache with dynamic data, so this will have to change.
  originalUrl.search = ''

  const normalizedHref = originalUrl.href as NormalizedHref
  const normalizedNextUrl = (
    nextUrl !== null ? nextUrl : ''
  ) as NormalizedNextUrl
  const id = `|${normalizedHref}|${normalizedNextUrl}|` as RouteCacheKeyId

  const cacheKey = {
    id,
    href: normalizedHref,
    nextUrl: normalizedNextUrl,
  } as RouteCacheKey

  return cacheKey
}
