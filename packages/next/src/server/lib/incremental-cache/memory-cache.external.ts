import type { CacheHandlerValue } from '.'
import { CachedRouteKind } from '../../response-cache/types'
import { LRUCache } from '../lru-cache'

let memoryCache: LRUCache<CacheHandlerValue> | undefined

export function getMemoryCache(maxMemoryCacheSize: number) {
  if (!memoryCache) {
    memoryCache = new LRUCache(maxMemoryCacheSize, function length({ value }) {
      let size: number
      if (!value) {
        size = 25
      } else if (value.kind === CachedRouteKind.REDIRECT) {
        size = JSON.stringify(value.props).length
      } else if (value.kind === CachedRouteKind.IMAGE) {
        throw new Error('invariant image should not be incremental-cache')
      } else if (value.kind === CachedRouteKind.FETCH) {
        size = JSON.stringify(value.data || '').length
      } else if (value.kind === CachedRouteKind.APP_ROUTE) {
        size = value.body.length
      } else {
        // APP_PAGE and PAGES entries can legitimately have an empty HTML shell
        // (for example, a generic partial-fallback shell backed entirely by
        // postponed data). Keep those entries cacheable by enforcing the
        // minimum non-zero size expected by LRUCache.
        size =
          value.html.length +
          (JSON.stringify(
            value.kind === CachedRouteKind.APP_PAGE
              ? value.rscData
              : value.pageData
          )?.length || 0)
      }

      return Math.max(size, 1)
    })
  }

  return memoryCache
}
