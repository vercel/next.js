/**
 * Cookie reading and subscription for the instant navigation devtools panel.
 *
 * The cookie value is a JSON array:
 *   [0]        — pending (waiting to capture)
 *   [1, null]  — captured MPA page load
 *   [1, { from, to }] — captured SPA navigation (from/to route trees)
 *
 * The "to" tree may be null initially and updated after the prefetch resolves.
 */

import { useMemo } from 'react'
import { useSyncExternalStore } from 'react'
import type {
  FlightRouterState,
  Segment,
} from '../../../../shared/lib/app-router-types'

const COOKIE_NAME = 'next-instant-navigation-testing'

export type InstantNavCookieData =
  | { state: 'pending' }
  | { state: 'mpa' }
  | {
      state: 'spa'
      fromTree: FlightRouterState
      toTree: FlightRouterState | null
    }

function parseCookieValue(raw: string): InstantNavCookieData {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length >= 3) {
      const rawState = parsed[2]
      if (rawState === null) {
        return { state: 'mpa' }
      }
      // SPA capture: rawState is { from, to }
      if (typeof rawState === 'object' && rawState !== null) {
        const fromTree: FlightRouterState = rawState.from ?? ['', {}]
        const toTree: FlightRouterState | null = rawState.to ?? null
        return { state: 'spa', fromTree, toTree }
      }
      return { state: 'spa', fromTree: ['', {}], toTree: null }
    }
  } catch {}
  return { state: 'pending' }
}

export function readInstantNavCookieState():
  | InstantNavCookieData['state']
  | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/next-instant-navigation-testing=([^;]*)/)
  if (!match) return null
  return parseCookieValue(match[1]).state
}

/**
 * Formats a FlightRouterState tree into a route pattern string for display.
 * Dynamic segments are shown with bracket syntax (e.g. [slug], [...params],
 * [[...optional]]) rather than their filled-in values. Search params are
 * omitted because they don't affect navigation.
 */
export function formatRoutePattern(tree: FlightRouterState): string {
  const segments: string[] = []
  let current: FlightRouterState | undefined = tree

  while (current) {
    const segment: Segment = current[0]
    const children: Record<string, FlightRouterState> | undefined = current[1]

    if (typeof segment === 'string') {
      // Skip root segment (''), page sentinels, default sentinels,
      // and route groups (parenthesized segments like "(marketing)")
      if (
        segment !== '' &&
        !segment.startsWith('__PAGE__') &&
        segment !== '__DEFAULT__' &&
        !(segment.startsWith('(') && segment.endsWith(')'))
      ) {
        segments.push(segment)
      }
    } else if (Array.isArray(segment)) {
      // Dynamic segment tuple: [paramName, paramCacheKey, dynamicParamType, staticSiblings]
      const paramName = segment[0]
      const dynamicParamType = segment[2]

      if (dynamicParamType === 'c' || dynamicParamType.startsWith('ci')) {
        // Catch-all: [...param]
        segments.push(`[...${paramName}]`)
      } else if (dynamicParamType === 'oc') {
        // Optional catch-all: [[...param]]
        segments.push(`[[...${paramName}]]`)
      } else {
        // Dynamic: [param]
        segments.push(`[${paramName}]`)
      }
    }

    // Follow the children parallel route
    current = children?.children
  }

  return '/' + segments.join('/')
}

// The raw cookie string is used as the useSyncExternalStore snapshot.
// Strings are compared by value, so no referential stability concerns.
// Parsing happens during render via useMemo.

// Cache the latest raw cookie value observed from CookieStore events.
// document.cookie may not reflect async cookieStore.set() writes
// immediately, so the snapshot reads this cache first.
let cachedRawValue: string | undefined = undefined

function readRawCookieValue(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/next-instant-navigation-testing=([^;]*)/)
  return match ? match[1] : ''
}

function getSnapshot(): string {
  if (cachedRawValue !== undefined) {
    return cachedRawValue
  }
  return readRawCookieValue()
}

function subscribe(callback: () => void): () => void {
  if (typeof cookieStore === 'undefined') {
    return () => {}
  }
  function handler(event: CookieChangeEvent) {
    for (const cookie of event.changed) {
      if (cookie.name === COOKIE_NAME) {
        cachedRawValue = cookie.value ?? ''
        callback()
        return
      }
    }
    for (const cookie of event.deleted) {
      if (cookie.name === COOKIE_NAME) {
        cachedRawValue = ''
        callback()
        return
      }
    }
  }
  cookieStore.addEventListener('change', handler)
  return () => {
    cookieStore.removeEventListener('change', handler)
  }
}

/**
 * Subscribes to the instant navigation cookie value. The cookie is the
 * sole source of truth — this hook reads it via useSyncExternalStore.
 *
 * The raw cookie string is the snapshot (stable by value comparison).
 * Parsing into structured data happens during render via useMemo.
 *
 * Returns null when the cookie is absent.
 */
export function useInstantNavCookieState(): InstantNavCookieData | null {
  const rawValue = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo(() => {
    if (!rawValue) return null
    return parseCookieValue(rawValue)
  }, [rawValue])
}
