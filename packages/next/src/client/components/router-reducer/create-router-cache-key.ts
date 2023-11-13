import type { Segment } from '../../../server/app-render/types'

const CACHE_KEY_DELIMITER = '|'

export function createRouterCacheKey(
  segment: Segment,
  withoutSearchParameters: boolean = false
) {
  return Array.isArray(segment)
    ? segment.join(CACHE_KEY_DELIMITER).toLowerCase()
    : withoutSearchParameters && segment.startsWith('__PAGE__')
    ? '__PAGE__'
    : segment
}

export function isDynamicCacheKey(cacheKey: string) {
  return cacheKey.includes(CACHE_KEY_DELIMITER)
}
