import type { FlightRouterState } from '../../shared/lib/app-router-types'
import { flightRouterStateSchema } from './types'
import { assert } from 'next/dist/compiled/superstruct'

const INVALID_FLIGHT_ROUTER_STATE_ERROR_CODE =
  'NEXT_INVALID_FLIGHT_ROUTER_STATE'

/**
 * Thrown when the router state header can't be accepted. This is invalid
 * client input (e.g. a tab still running a previous build after a deployment),
 * so request handlers respond with a 400 instead of treating it as a server
 * error.
 */
class InvalidFlightRouterStateError extends Error {
  readonly code = INVALID_FLIGHT_ROUTER_STATE_ERROR_CODE
}

/**
 * Checks for an `InvalidFlightRouterStateError` by its code rather than with
 * `instanceof`, because the error may be thrown and caught by different
 * bundle layers.
 */
export function isInvalidFlightRouterStateError(
  err: unknown
): err is InvalidFlightRouterStateError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === INVALID_FLIGHT_ROUTER_STATE_ERROR_CODE
  )
}

export function parseAndValidateFlightRouterState(
  stateHeader: string | string[]
): FlightRouterState
export function parseAndValidateFlightRouterState(
  stateHeader: undefined
): undefined
export function parseAndValidateFlightRouterState(
  stateHeader: string | string[] | undefined
): FlightRouterState | undefined
export function parseAndValidateFlightRouterState(
  stateHeader: string | string[] | undefined
): FlightRouterState | undefined {
  if (typeof stateHeader === 'undefined') {
    return undefined
  }
  if (Array.isArray(stateHeader)) {
    throw new InvalidFlightRouterStateError(
      'Multiple router state headers were sent. This is not allowed.'
    )
  }

  // We limit the size of the router state header to ~40kb. This is to prevent
  // a malicious user from sending a very large header and slowing down the
  // resolving of the router state.
  // This is around 2,000 nested or parallel route segment states:
  // '{"children":["",{}]}'.length === 20.
  if (stateHeader.length > 20 * 2000) {
    throw new InvalidFlightRouterStateError(
      'The router state header was too large.'
    )
  }

  try {
    const state = JSON.parse(decodeURIComponent(stateHeader))
    assert(state, flightRouterStateSchema)
    return state
  } catch {
    throw new InvalidFlightRouterStateError(
      'The router state header was sent but could not be parsed.'
    )
  }
}
