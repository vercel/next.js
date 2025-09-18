import type { Segment } from '../../../../shared/lib/app-router-types'

export function getSegmentValue(segment: Segment) {
  return Array.isArray(segment) ? segment[1] : segment
}
