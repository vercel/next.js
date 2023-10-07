import { Segment } from '../../../server/app-render/types'

export function createRouterCacheKey(
  segment: Segment,
  withoutSearchParameters: boolean = false
) {
  return Array.isArray(segment)
    ? `${segment[0]}|${segment[1]}|${segment[2]}`.toLowerCase()
    : withoutSearchParameters && segment.startsWith('__PAGE__')
    ? '__PAGE__'
    : segment
}
