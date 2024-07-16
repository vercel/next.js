import type {
  ActionResult,
  FlightData,
  InitialRSCPayload,
  RSCPayload,
} from '../../server/app-render/types'

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the FlightData
 * as the server can respond with a different shape depending on the type of request.
 */
export function getFlightDataFromRSCPayload(
  payload: RSCPayload
): FlightData | null {
  switch (payload.t) {
    case 'a':
    case 'i':
    case 'n': {
      return payload.p.f
    }

    default: {
      throw new Error(
        'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
      )
    }
  }
}

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the build ID
 * as the server can respond with a different shape depending on the type of request.
 */
export function getBuildIdFromRSCPayload(payload: RSCPayload): string {
  switch (payload.t) {
    case 'i':
    case 'a':
    case 'n': {
      return payload.p.b
    }

    default: {
      throw new Error(
        'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
      )
    }
  }
}

/**
 * Given an RSC payload (from a `callServer` invocation), extracts the ActionResult
 * if it exists, otherwise returns null.
 */
export function getActionResultFromRSCPayload(
  payload: RSCPayload
): ActionResult | null {
  if (payload.t !== 'a') {
    throw new Error(
      'Invariant: Received an unexpected RSC payload. This is a bug in Next.js.'
    )
  }

  return payload.p.a
}

export function getInitialRSCPayload(payload: RSCPayload): InitialRSCPayload {
  if (payload.t !== 'i') {
    throw new Error(
      'Invariant: Expected root RSC payload. This is a bug in Next.js.'
    )
  }

  return payload.p
}
