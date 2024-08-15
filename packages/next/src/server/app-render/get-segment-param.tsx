import type { DynamicParamTypes } from './types'
import type { DynamicRouteParams } from '../../client/components/params'
import { INTERCEPTION_ROUTE_MARKERS } from '../lib/interception-routes'
import { createFallbackDynamicParamType } from './fallbacks'

/**
 * Parse dynamic route segment to type of parameter
 */
export function getSegmentParam(
  segment: string,
  unknownRouteParams?: DynamicRouteParams | null
): {
  param: string
  type: DynamicParamTypes
} | null {
  const interceptionMarker = INTERCEPTION_ROUTE_MARKERS.find((marker) =>
    segment.startsWith(marker)
  )

  // if an interception marker is part of the path segment, we need to jump ahead
  // to the relevant portion for param parsing
  if (interceptionMarker) {
    segment = segment.slice(interceptionMarker.length)
  }

  let param: string
  let type: DynamicParamTypes

  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    // TODO-APP: Optional catchall does not currently work with parallel routes,
    // so for now aren't handling a potential interception marker.
    type = 'optional-catchall'
    param = segment.slice(5, -2)
  } else if (segment.startsWith('[...') && segment.endsWith(']')) {
    type = interceptionMarker ? 'catchall-intercepted' : 'catchall'
    param = segment.slice(4, -1)
  } else if (segment.startsWith('[') && segment.endsWith(']')) {
    type = interceptionMarker ? 'dynamic-intercepted' : 'dynamic'
    param = segment.slice(1, -1)
  } else {
    return null
  }

  // If the param is unknown, mark it as a fallback.
  if (unknownRouteParams?.has(param)) {
    type = createFallbackDynamicParamType(type)
  }

  return {
    param,
    type,
  }
}
