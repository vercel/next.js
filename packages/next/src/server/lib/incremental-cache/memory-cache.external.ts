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
      if (value.kind === CachedRouteKind.APP_PAGE) {
        return Math.max(
          1,
          value.html.length +
            getBufferSize(value.rscData) +
            (value.postponed?.length || 0) +
            getSegmentDataSize(value.segmentData)
        )
      }

      return value.html.length + (JSON.stringify(value.pageData)?.length || 0)
    })
  }

  return memoryCache
}
