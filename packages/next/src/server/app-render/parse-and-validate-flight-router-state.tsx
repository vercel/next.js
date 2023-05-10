import { FlightRouterState } from './types'
import { flightRouterStateSchema } from './types'

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
    return flightRouterStateSchema.parse(JSON.parse(stateHeader))
  } catch {
    throw new Error('The router state header was sent but could not be parsed.')
  }
}
