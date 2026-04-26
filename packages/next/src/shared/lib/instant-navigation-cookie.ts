/**
 * Shared parser for the `next-instant-navigation-testing` cookie.
 *
 * The cookie is a JSON-encoded tuple. Shape:
 *
 *   [0, id]                              — pending (len 2, legacy/external)
 *   [0, id, sessionId]                   — pending (len 3)
 *   [1, id, null]                        — captured MPA (len 3, legacy/external)
 *   [1, id, null, sessionId]             — captured MPA (len 4)
 *   [1, id, { from, to }]                — captured SPA (len 3, legacy/external)
 *   [1, id, { from, to }, sessionId]     — captured SPA (len 4)
 *
 * `sessionId` is an optional trailing element appended by writers that know
 * the current server's session ID (the devtools panel and the on-page
 * navigation lock). External writers (Playwright `instant()`) omit it.
 *
 * Cookies with a sessionId present but mismatching the current server are
 * treated as stale and ignored (see `hasValidInstantTestCookie`). Cookies
 * with no sessionId slot are accepted unchanged — this preserves behavior
 * for external writers.
 */
import { NEXT_INSTANT_TEST_COOKIE } from '../../client/components/app-router-headers'

import type { FlightRouterState } from './app-router-types'

export type InstantTestCookieState =
  | { kind: 'pending' }
  | { kind: 'mpa' }
  | {
      kind: 'spa'
      fromTree: FlightRouterState
      toTree: FlightRouterState | null
    }

export type InstantTestCookie = {
  state: InstantTestCookieState
  id: string
  /** null when the writer didn't include a session ID slot */
  sessionId: string | null
}

export function parseInstantTestCookie(
  raw: string | undefined
): InstantTestCookie | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length < 2) return null

    const captured = parsed[0]
    const id = parsed[1]
    if (typeof id !== 'string') return null

    if (captured === 0) {
      // Pending: [0, id] or [0, id, sessionId]
      const sessionId = parsed.length >= 3 ? readSessionId(parsed[2]) : null
      return { state: { kind: 'pending' }, id, sessionId }
    }

    if (captured === 1) {
      // Captured: [1, id, state] or [1, id, state, sessionId]
      const rawState = parsed[2]
      const sessionId = parsed.length >= 4 ? readSessionId(parsed[3]) : null
      if (rawState === null) {
        return { state: { kind: 'mpa' }, id, sessionId }
      }
      if (typeof rawState === 'object' && rawState !== null) {
        const fromTree: FlightRouterState = rawState.from ?? ['', {}]
        const toTree: FlightRouterState | null = rawState.to ?? null
        return {
          state: { kind: 'spa', fromTree, toTree },
          id,
          sessionId,
        }
      }
    }
  } catch {}
  return null
}

function readSessionId(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Parses a raw `Cookie:` request header and returns the value of the
 * instant-nav cookie, or undefined if not present. Tolerant of whitespace
 * and multiple cookies.
 */
export function readInstantTestCookieValue(
  cookieHeader: string | undefined
): string | undefined {
  if (!cookieHeader) return undefined
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (name === NEXT_INSTANT_TEST_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return undefined
}

/**
 * Returns true if the request's instant-nav cookie should be honored by the
 * server — i.e. present and (when it carries a sessionId) matching the
 * current server's sessionId.
 *
 * Cookies with no sessionId slot are honored unchanged, preserving behavior
 * for external writers like Playwright `instant()`.
 */
export function hasValidInstantTestCookie(
  cookieHeader: string | undefined,
  currentSessionId: string
): boolean {
  const raw = readInstantTestCookieValue(cookieHeader)
  const parsed = parseInstantTestCookie(raw)
  if (parsed === null) return false
  if (parsed.sessionId === null) return true
  return parsed.sessionId === currentSessionId
}
