import type { CacheHandlerValue } from '.'
import { CachedRouteKind } from '../../response-cache/types'
import { LRUCache } from '../lru-cache'

let memoryCache: LRUCache<CacheHandlerValue> | undefined

function getBufferSize(buffer: Buffer | undefined) {
  return buffer?.length || 0
}

function getSegmentDataSize(segmentData: Map<string, Buffer> | undefined) {
  if (!segmentData) {
    return 0
  }

  let size = 0

  for (const [segmentPath, buffer] of segmentData) {
    size += segmentPath.length + getBufferSize(buffer)
  }

  return size
}

export function getMemoryCache(maxMemoryCacheSize: number) {
  if (!memoryCache) {
    memoryCache = new LRUCache(maxMemoryCacheSize, function length(
      { value },
      cacheKey
    ) {
      let valueSize: number

      if (!value) {
        valueSize = 25
      } else if (value.kind === CachedRouteKind.REDIRECT) {
        valueSize = JSON.stringify(value.props).length
      } else if (value.kind === CachedRouteKind.IMAGE) {
        throw new Error('invariant image should not be incremental-cache')
      } else if (value.kind === CachedRouteKind.FETCH) {
        valueSize = JSON.stringify(value.data || '').length
      } else if (value.kind === CachedRouteKind.APP_ROUTE) {
        valueSize = value.body.length
      } else if (value.kind === CachedRouteKind.APP_PAGE) {
        // rough estimate of size of cache value
        valueSize = Math.max(
          1,
          value.html.length +
            getBufferSize(value.rscData) +
            (value.postponed?.length || 0) +
            getSegmentDataSize(value.segmentData)
        )
      } else {
        valueSize =
          value.html.length + (JSON.stringify(value.pageData)?.length || 0)
      }

      return cacheKey.length + valueSize
    })
  }

  return memoryCache
}
