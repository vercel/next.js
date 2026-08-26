import type { Segment } from '../../shared/lib/app-router-types'
import { canonicalizeURLPart } from '../route-params'

export const matchSegment = (
  existingSegment: Segment,
  segment: Segment
): boolean => {
  // segment is either Array or string
  if (typeof existingSegment === 'string') {
    if (typeof segment === 'string') {
      // Common case: segment is just a string
      return existingSegment === segment
    }
    return false
  }

  if (typeof segment === 'string') {
    return false
  }
  return (
    existingSegment[0] === segment[0] &&
    canonicalizeURLPart(existingSegment[1]) === canonicalizeURLPart(segment[1])
  )
}
