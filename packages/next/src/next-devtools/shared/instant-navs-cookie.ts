/**
 * Cookie reading, subscription and mutation for the instant navigation devtools
 * (both the dev overlay panel and the production Instant DevTools widget).
 *
 * The cookie value is a JSON array:
 *   [0, id]        — pending (waiting to capture)
 *   [1, id, null]  — captured MPA page load
 *   [1, id, { from, to }] — captured SPA navigation (from/to route trees)
 *
 * The "to" tree may be null initially and updated after the prefetch resolves.
 *
 * This module is shared client-only code: it is bundled into both the dev
 * overlay (`next-devtools.webpack-config.js`) and the production widget
 * (`next-instant-devtools.webpack-config.js`), where `react` resolves to the
 * vendored React build. It must not be imported from server/edge code.
 */

import { useMemo } from 'react'
import { useSyncExternalStore } from 'react'
import type {
  FlightRouterState,
  InstantCookie,
  Segment,
} from '../../shared/lib/app-router-types'
import {
  parseInstantNavCookieValue,
  type InstantNavCookieData,
} from '../../shared/lib/instant-nav-cookie'

const COOKIE_NAME = 'next-instant-navigation-testing'

export function readInstantNavCookieState():
  | InstantNavCookieData['state']
  | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/next-instant-navigation-testing=([^;]*)/)
  if (!match) return null
  return parseInstantNavCookieValue(match[1]).state
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

function isInitialInstantTestStaticShell(rawValue: string): boolean {
  return (
    rawValue !== '' &&
    cachedRawValue === undefined &&
    typeof self !== 'undefined' &&
    Boolean(self.__next_instant_test)
  )
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
    // A full page load into an instant-test static shell writes the MPA
    // cookie asynchronously. Until that CookieStore event lands, the cookie
    // may still contain the previous SPA capture from before the reload.
    if (isInitialInstantTestStaticShell(rawValue)) {
      return { state: 'mpa' }
    }
    return parseInstantNavCookieValue(rawValue)
  }, [rawValue])
}

/**
 * Set the instant cookie to [0, <random>] (pending) — acquires the lock on the
 * next navigation or reload. The random suffix ensures repeated calls always
 * trigger a CookieStore change event.
 */
export function lock(): void {
  if (typeof cookieStore !== 'undefined') {
    const cookie: InstantCookie = [0, `p${Math.random()}`]
    cookieStore.set({
      name: COOKIE_NAME,
      value: JSON.stringify(cookie),
      path: '/',
    })
  }
}

/** Delete the instant cookie — releases the lock, triggers dynamic data streaming. */
export function unlock(): void {
  if (typeof cookieStore !== 'undefined') {
    cookieStore.delete(COOKIE_NAME)
  }
}
