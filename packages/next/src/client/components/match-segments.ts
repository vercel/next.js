import { getSegmentParam } from '../../server/app-render/get-segment-param'
import type { Segment } from '../../server/app-render/types'

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
  return existingSegment[0] === segment[0] && existingSegment[1] === segment[1]
}

/*
 * This function is used to determine if an existing segment can be overridden by the incoming segment.
 */
export const canSegmentBeOverridden = (
  existingSegment: Segment,
  segment: Segment
): boolean => {
  if (Array.isArray(existingSegment) || !Array.isArray(segment)) {
    return false
  }

  return getSegmentParam(existingSegment)?.param === segment[0]
}
