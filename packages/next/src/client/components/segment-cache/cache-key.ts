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

/**
 * Splits a pathname into its non-empty parts. Equivalent to
 * `pathname.split('/').filter((p) => p !== '')` — empty tokens produced by
 * leading, trailing, or consecutive slashes are skipped.
 *
 * We use a manual loop instead of `split` + `filter` because
 * `String.prototype.split` can return arrays with either the packed or holey
 * elements kind depending on internal fast paths, and `filter`/`slice`
 * propagate the kind. Mixing holey and packed arrays at the same call sites
 * makes downstream array method loads (`slice`, `join`, `length`) polymorphic
 * and causes repeated "wrong map" deoptimizations in hot route-matching code.
 * Pushing into an array literal guarantees a packed elements kind.
 */
export function splitPathnameIntoParts(pathname: string): Array<string> {
  const parts: Array<string> = []
  let start = 0
  for (let i = 0; i < pathname.length; i++) {
    if (pathname.charCodeAt(i) === 47 /* '/' */) {
      if (i > start) {
        parts.push(pathname.slice(start, i))
      }
      start = i + 1
    }
  }
  if (start < pathname.length) {
    parts.push(pathname.slice(start))
  }
  return parts
}
