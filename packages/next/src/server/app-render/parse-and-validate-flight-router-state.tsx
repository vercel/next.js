import type { FlightRouterState } from '../../shared/lib/app-router-types'
import { flightRouterStateSchema } from './types'
import { assert } from 'next/dist/compiled/superstruct'

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
    throw new Error(
      'Multiple router state headers were sent. This is not allowed.'
    )
  }

  // We limit the size of the router state header to ~40kb. This is to prevent
  // a malicious user from sending a very large header and slowing down the
  // resolving of the router state.
  // This is around 2,000 nested or parallel route segment states:
  // '{"children":["",{}]}'.length === 20.
  if (stateHeader.length > 20 * 2000) {
    throw new Error('The router state header was too large.')
  }

  try {
    const state = JSON.parse(decodeURIComponent(stateHeader))
    assert(state, flightRouterStateSchema)
    return state
  } catch {
    throw new Error('The router state header was sent but could not be parsed.')
  }
}
