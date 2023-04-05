import { Segment } from '../../../server/app-render/types'

export function createRouterCacheKey(segment: Segment) {
  return Array.isArray(segment)
    ? `${segment[0]}|${segment[1]}|${segment[2]}`
    : segment
}
