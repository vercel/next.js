import type { Segment } from '../../../shared/lib/app-router-types'
import { createRouterCacheKey } from './create-router-cache-key'

// React uses these keys to find suspended subtrees when resuming HTML. They
// must be the same before and after route params and search params are known.
// The browser uses the concrete keys instead, so navigation still resets or
// preserves state as appropriate. Its bundle uses create-segment-key.browser.ts.
// React keys are not embedded in the HTML.
export function createSegmentKey(
  segment: Segment,
  // Server keys always omit search params, regardless of this browser option.
  _withoutSearchParameters?: boolean
): string {
  if (Array.isArray(segment)) {
    return `${segment[0]}|${segment[2]}`
  }

  return createRouterCacheKey(segment, true)
}
