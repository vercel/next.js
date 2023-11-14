import type { Segment } from '../../../server/app-render/types'

export const DYNAMIC_CACHE_KEY_DELIMITER = '|'

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
