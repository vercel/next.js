import { getSegmentParam } from '../../server/app-render/get-segment-param'
import type { Segment } from '../../server/app-render/types'

export const matchSegment = (
  existingSegment: Segment,
  segment: Segment
): boolean => {
  // Common case: segment is just a string
  if (typeof existingSegment === 'string' && typeof segment === 'string') {
    return existingSegment === segment
  }

  // Dynamic parameter case: segment is an array with param/value. Both param and value are compared.
  if (Array.isArray(existingSegment) && Array.isArray(segment)) {
    return (
      existingSegment[0] === segment[0] && existingSegment[1] === segment[1]
    )
  }

  return false
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
