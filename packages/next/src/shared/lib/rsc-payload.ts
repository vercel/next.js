import type {
  ActionFlightResponse,
  ActionResult,
  FlightData,
  InitialRSCPayload,
  NavigationFlightResponse,
  RSCPayload,
} from '../../server/app-render/types'

function isActionRSCPayload(
  payload: RSCPayload
): payload is ActionFlightResponse {
  // Server actions (with a result) are represented as a tuple of [ActionResult, [BuildId, FlightData]]
  return Array.isArray(payload) && typeof payload[0] !== 'string'
}

function isRootRSCPayload(payload: RSCPayload): payload is InitialRSCPayload {
  // Root responses are represented as an object representing the initial props that
  // render `<AppRouter />`. All other responses are arrays.
  return !Array.isArray(payload) && typeof payload.b === 'string'
}

function isNavigationRSCPayload(
  payload: RSCPayload
): payload is NavigationFlightResponse {
  // Regular RSC responses (for non-static pages) use FlightRouterState to diff the tree on the server
  // to preserve common layout(s) and only start rendering from the new segment. They are represented as
  // a tuple of [BuildId, FlightData]. Used by the client router for navigations or refreshes.
  return Array.isArray(payload) && typeof payload[0] === 'string'
}

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the FlightData
 * as the server can respond with a different shape depending on the type of request.
 */
export function getFlightDataFromRSCPayload(
  payload: RSCPayload
): FlightData | null {
  if (isActionRSCPayload(payload)) {
    return payload[1][1]
  }

  if (isRootRSCPayload(payload)) {
    return [[payload.t, payload.d, payload.h]]
  }

  if (isNavigationRSCPayload(payload)) {
    return payload[1]
  }

  throw new Error(
    'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
  )
}

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the build ID
 * as the server can respond with a different shape depending on the type of request.
 */
export function getBuildIdFromRSCPayload(payload: RSCPayload): string {
  if (isRootRSCPayload(payload)) {
    return payload.b
  }

  if (isActionRSCPayload(payload)) {
    return payload[1][0]
  }

  if (isNavigationRSCPayload(payload)) {
    return payload[0]
  }

  // All payload types should return a build ID. If we get here, something is wrong with the server response.
  throw new Error(
    'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
  )
}

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the ActionResult
 * if it exists, otherwise returns null.
 */
export function getActionResultFromRSCPayload(
  payload: RSCPayload
): ActionResult | null {
  if (isActionRSCPayload(payload)) {
    return payload[0]
  }

  throw new Error(
    'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
  )
}

export function getInitialRSCPayload(payload: RSCPayload): InitialRSCPayload {
  if (!isRootRSCPayload(payload)) {
    throw new Error(
      'Invariant: Expected root RSC payload. This is a bug in Next.js.'
    )
  }

  return payload
}
