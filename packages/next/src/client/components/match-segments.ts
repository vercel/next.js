import { getSegmentParam } from '../../server/app-render/get-segment-param'
import type { Segment } from '../../server/app-render/types'
import { DYNAMIC_CACHE_KEY_DELIMITER } from './router-reducer/create-router-cache-key'

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

export const matchDynamicSegment = (
  existingSegment: Segment,
  segment: Segment
) => {
  // If segment is dynamic (an array), we can't match
  if (Array.isArray(segment)) {
    return false
  }

  if (!Array.isArray(existingSegment)) {
    // if we don't already have a dynamic segment, check if it's delimited by the dynamic cache key delimiter
    // if it is, we can split based on that delimiter
    if (existingSegment.includes(DYNAMIC_CACHE_KEY_DELIMITER)) {
      existingSegment = existingSegment.split(
        DYNAMIC_CACHE_KEY_DELIMITER
      ) as Segment
    } else {
      // existingSegment should be an array if it's dynamic
      // if we aren't able to get the dynamic params from it, we don't try to match
      return false
    }
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
