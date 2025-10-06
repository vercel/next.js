import type { IncomingHttpHeaders } from 'node:http'

import { FLIGHT_HEADERS } from '../../client/components/app-router-headers'

/**
 * Removes the flight headers from the request.
 *
 * @param req the request to strip the headers from
 */
export function stripFlightHeaders(headers: IncomingHttpHeaders) {
  for (const header of FLIGHT_HEADERS) {
    delete headers[header]
  }
}
