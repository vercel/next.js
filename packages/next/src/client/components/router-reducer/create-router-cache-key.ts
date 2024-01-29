import type { Segment } from '../../../server/app-render/types'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

export function createRouterCacheKey(
  segment: Segment,
  withoutSearchParameters: boolean = false
) {
  // if the segment is an array, it means it's a dynamic segment
  // for example, ['lang', 'en', 'd']. We need to convert it to a string to store it as a cache node key.
  if (Array.isArray(segment)) {
    return `${segment[0]}|${segment[1]}|${segment[2]}`.toLowerCase()
  }

  // Page segments might have search parameters, ie __PAGE__?foo=bar
  // When `withoutSearchParameters` is true, we only want to return the page segment
  if (withoutSearchParameters && segment.startsWith(PAGE_SEGMENT_KEY)) {
    return PAGE_SEGMENT_KEY
  }

  return segment
}
