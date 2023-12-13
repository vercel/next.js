import type { Segment } from '../../../server/app-render/types'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/constants'

export function createRouterCacheKey(
  segment: Segment,
  withoutSearchParameters: boolean = false
) {
  return Array.isArray(segment)
    ? `${segment[0]}|${segment[1]}|${segment[2]}`.toLowerCase()
    : withoutSearchParameters && segment.startsWith(PAGE_SEGMENT_KEY)
    ? PAGE_SEGMENT_KEY
    : segment
}
