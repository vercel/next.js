import type { FlightRouterState } from '../../shared/lib/app-router-types'
import { flightRouterStateSchema } from './types'
import { assert } from 'next/dist/compiled/superstruct'

const HEADER_MAX_SIZE = 20 * 2000
const HEADER_MAX_LENGTH = 1_000

// Redact potentially sensitive data
function sanitizeHeader(header: string) {
  const sanitizedHeader = header
    .substring(0, HEADER_MAX_LENGTH)
    .replace(/[?&]([^=&]+)=([^&]*)/g, (key) => {
      // Keep structure but hide values
      return `${key}=[REDACTED]`
    })

  return `${sanitizedHeader}${sanitizedHeader.length > HEADER_MAX_LENGTH ? '... [truncated]' : ''}).`
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
    throw new Error(
      `Multiple router state headers were sent. This is not allowed (stateHeader length ${stateHeader.length}).`
    )
  }

  // We limit the size of the router state header to ~40kb. This is to prevent
  // a malicious user from sending a very large header and slowing down the
  // resolving of the router state.
  // This is around 2,000 nested or parallel route segment states:
  // '{"children":["",{}]}'.length === 20.
  if (stateHeader.length > HEADER_MAX_SIZE) {
    throw new Error(
      `The router state header was too large (${stateHeader.length} bytes,max: ${HEADER_MAX_SIZE} bytes). Preview: ${sanitizeHeader(stateHeader)}).`
    )
  }

  try {
    const state = JSON.parse(decodeURIComponent(stateHeader))
    assert(state, flightRouterStateSchema)
    return state
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    throw new Error(
      `The router state header was sent but could not be parsed. Error: '${message}'. Header preview: ${sanitizeHeader(stateHeader)})`
    )
  }
}
