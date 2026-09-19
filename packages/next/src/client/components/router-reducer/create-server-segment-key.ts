import type { Segment } from '../../../shared/lib/app-router-types'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

// React uses these keys to find suspended subtrees when resuming HTML. They
// must be the same before and after route params and search params are known.
// The browser uses the concrete keys instead, so navigation still resets or
// preserves state as appropriate. React keys are not embedded in the HTML.
export function createServerSegmentKey(segment: Segment): string {
  if (Array.isArray(segment)) {
    return `${segment[0]}|${segment[2]}`
  }

  if (segment.startsWith(PAGE_SEGMENT_KEY)) {
    return PAGE_SEGMENT_KEY
  }

  return segment
}
