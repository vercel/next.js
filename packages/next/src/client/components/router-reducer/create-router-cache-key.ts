import type { Segment } from '../../../shared/lib/app-router-types'

export function createRouterCacheKey(segment: Segment) {
  // if the segment is an array, it means it's a dynamic segment
  // for example, ['lang', 'en', 'd']. We need to convert it to a string to store it as a cache node key.
  if (Array.isArray(segment)) {
    return `${segment[0]}|${segment[1]}|${segment[2]}`
  }

  return segment
}
