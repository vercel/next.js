import type { CacheHandlerValue } from '.'
import { CachedRouteKind } from '../../response-cache/types'
import { LRUCache } from '../lru-cache'

let memoryCache: LRUCache<CacheHandlerValue> | undefined

export function getMemoryCache(maxMemoryCacheSize: number) {
  if (!memoryCache) {
    memoryCache = new LRUCache(maxMemoryCacheSize, function length({ value }) {
      if (!value) {
        return 25
      } else if (value.kind === CachedRouteKind.REDIRECT) {
        return JSON.stringify(value.props).length
      } else if (value.kind === CachedRouteKind.IMAGE) {
        throw new Error('invariant image should not be incremental-cache')
      } else if (value.kind === CachedRouteKind.FETCH) {
        return JSON.stringify(value.data || '').length
      } else if (value.kind === CachedRouteKind.APP_ROUTE) {
        return value.body.length
      }
      // rough estimate of size of cache value
      return (
        value.html.length +
        (JSON.stringify(
          value.kind === CachedRouteKind.APP_PAGE
            ? value.rscData
            : value.pageData
        )?.length || 0)
      )
    })
  }

  return memoryCache
}
