import type { Segment } from '../../../../server/app-render/types'

export function getSegmentValue(segment: Segment) {
  return Array.isArray(segment) ? segment[1] : segment
}
