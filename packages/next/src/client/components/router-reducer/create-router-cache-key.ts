import { isShortDynamicParam } from '../../../server/app-render/get-short-dynamic-param-type'
import type { Segment } from '../../../server/app-render/types'

const DYNAMIC_CACHE_KEY_DELIMITER = '|'

export function createRouterCacheKey(
  segment: Segment,
  withoutSearchParameters: boolean = false
) {
  return Array.isArray(segment)
    ? segment.join(DYNAMIC_CACHE_KEY_DELIMITER).toLowerCase()
    : withoutSearchParameters && segment.startsWith('__PAGE__')
    ? '__PAGE__'
    : segment
}

export function extractSegmentFromCacheKey(cacheKey: string): Segment {
  // the key doesn't have any dynamic delimiters, so there's nothing we need to do
  if (!cacheKey.includes(DYNAMIC_CACHE_KEY_DELIMITER)) return cacheKey

  const [param, value, type] = cacheKey.split(DYNAMIC_CACHE_KEY_DELIMITER)

  if (!isShortDynamicParam(type)) {
    // if we got something we don't recognize, don't attempt to process it any further
    return cacheKey
  }

  return [param, value, type]
}
