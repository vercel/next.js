import { IncomingHttpHeaders } from 'http'
import { NEXT_ROUTER_STATE_TREE } from '../../client/components/app-router-headers'
import { parseAndValidateFlightRouterState } from '../app-render/parse-and-validate-flight-router-state'
import { FlightRouterState } from '../app-render/types'
import { INTERCEPTION_ROUTE_MARKERS } from '../future/helpers/interception-routes'

export function extractPathFromFlightRouterState(
  flightRouterState: FlightRouterState
): string | undefined {
  const segment = Array.isArray(flightRouterState[0])
    ? flightRouterState[0][1]
    : flightRouterState[0]

  if (
    segment === '__DEFAULT__' ||
    INTERCEPTION_ROUTE_MARKERS.some((m) => segment.startsWith(m))
  )
    return undefined

  if (segment === '__PAGE__') return ''

  const path = [segment]

  const parallelRoutes = flightRouterState[1] ?? {}

  const childrenPath = parallelRoutes.children
    ? extractPathFromFlightRouterState(parallelRoutes.children)
    : undefined

  if (childrenPath !== undefined) {
    path.push(childrenPath)
  } else {
    for (const [key, value] of Object.entries(parallelRoutes)) {
      if (key === 'children') continue

      const childPath = extractPathFromFlightRouterState(value)

      if (childPath !== undefined) {
        path.push(childPath)
      }
    }
  }

  const finalPath = path.join('/')

  // it'll end up including a trailing slash because of '__PAGE__'
  return finalPath.endsWith('/') ? finalPath.slice(0, -1) : finalPath
}

export function parseNextReferrerFromHeaders(
  headers: IncomingHttpHeaders
): string | undefined {
  const flightRouterState = parseAndValidateFlightRouterState(
    headers[NEXT_ROUTER_STATE_TREE.toLowerCase()]
  )

  if (!flightRouterState) return undefined
  return extractPathFromFlightRouterState(flightRouterState)
}
