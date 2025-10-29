import { INTERCEPTION_ROUTE_MARKERS } from './interception-routes'
import type { DynamicParamTypes } from '../../app-router-types'

/**
 * Parse dynamic route segment to type of parameter
 */
export function getSegmentParam(segment: string): {
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

  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return {
      // TODO-APP: Optional catchall does not currently work with parallel routes,
      // so for now aren't handling a potential interception marker.
      type: 'optional-catchall',
      param: segment.slice(5, -2),
    }
  }

  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return {
      type: interceptionMarker ? 'catchall-intercepted' : 'catchall',
      param: segment.slice(4, -1),
    }
  }

  if (segment.startsWith('[') && segment.endsWith(']')) {
    return {
      type: interceptionMarker ? 'dynamic-intercepted' : 'dynamic',
      param: segment.slice(1, -1),
    }
  }

  return null
}

export function isCatchAll(
  type: DynamicParamTypes
): type is 'catchall' | 'catchall-intercepted' | 'optional-catchall' {
  return (
    type === 'catchall' ||
    type === 'catchall-intercepted' ||
    type === 'optional-catchall'
  )
}

export function getParamProperties(paramType: DynamicParamTypes): {
  repeat: boolean
  optional: boolean
} {
  let repeat = false
  let optional = false

  switch (paramType) {
    case 'catchall':
    case 'catchall-intercepted':
      repeat = true
      break
    case 'optional-catchall':
      repeat = true
      optional = true
      break
    case 'dynamic':
    case 'dynamic-intercepted':
      break
    default:
      paramType satisfies never
  }

  return { repeat, optional }
}
