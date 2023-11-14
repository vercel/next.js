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
 * This function takes an existing dynamic segment and attempts to match it against
 * an incoming segment
 */
export const matchDynamicSegment = (
  existingSegment: Segment,
  segment: Segment
): boolean => {
  if (!Array.isArray(existingSegment)) {
    // This function is only meant to be used to match existing dynamic segments
    // If we don't have one, we should not attempt to match it
    return false
  }

  // if segment is also an array, it can be matched by matchSegment
  if (Array.isArray(segment)) {
    return matchSegment(existingSegment, segment)
  }

  // dynamic segments are encoded as an array, e.g. `["lang", "en", "d"]` where "lang" is the
  // name of the param, "en" is the value, and "d" is the type.
  // This compares the value of the dynamic segment with the regular segment
  return existingSegment[1] === segment
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
