import { InvariantError } from '../../invariant-error'
import { getSegmentParam, type SegmentParam } from '../utils/get-segment-param'
import {
  INTERCEPTION_ROUTE_MARKERS,
  type InterceptionMarker,
} from '../utils/interception-routes'

export type RouteGroupAppRouteSegment = {
  type: 'route-group'
  name: string

  /**
   * If present, this segment has an interception marker prefixing it.
   */
  interceptionMarker?: InterceptionMarker
}

export type ParallelRouteAppRouteSegment = {
  type: 'parallel-route'
  name: string

  /**
   * If present, this segment has an interception marker prefixing it.
   */
  interceptionMarker?: InterceptionMarker
}

export type StaticAppRouteSegment = {
  type: 'static'
  name: string

  /**
   * If present, this segment has an interception marker prefixing it.
   */
  interceptionMarker?: InterceptionMarker
}

export type DynamicAppRouteSegment = {
  type: 'dynamic'
  name: string
  param: SegmentParam

  /**
   * If present, this segment has an interception marker prefixing it.
   */
  interceptionMarker?: InterceptionMarker
}

/**
 * Represents a single segment in a route path.
 * Can be either static (e.g., "blog") or dynamic (e.g., "[slug]").
 */
export type AppRouteSegment =
  | StaticAppRouteSegment
  | DynamicAppRouteSegment
  | RouteGroupAppRouteSegment
  | ParallelRouteAppRouteSegment

export type NormalizedAppRouteSegment =
  | StaticAppRouteSegment
  | DynamicAppRouteSegment

function normalizeEncodedDynamicPlaceholder(segment: string): string {
  if (!/%5b|%5d/i.test(segment)) {
    return segment
  }

  try {
    const decodedSegment = decodeURIComponent(segment)
    return getSegmentParam(decodedSegment) ? decodedSegment : segment
  } catch {
    return segment
  }
}

export function parseAppRouteSegment(segment: string): AppRouteSegment | null {
  if (segment === '') {
    return null
  }

  // Check if the segment starts with an interception marker
  const interceptionMarker = INTERCEPTION_ROUTE_MARKERS.find((m) =>
    segment.startsWith(m)
  )

  const param = getSegmentParam(segment)
  if (param) {
    return {
      type: 'dynamic',
      name: segment,
      param,
      interceptionMarker,
    }
  } else if (segment.startsWith('(') && segment.endsWith(')')) {
    return {
      type: 'route-group',
      name: segment,
      interceptionMarker,
    }
  } else if (segment.startsWith('@')) {
    return {
      type: 'parallel-route',
      name: segment,
      interceptionMarker,
    }
  } else {
    return {
      type: 'static',
      name: segment,
      interceptionMarker,
    }
  }
}

export type AppRoute = {
  normalized: boolean
  pathname: string
  segments: AppRouteSegment[]
  dynamicSegments: DynamicAppRouteSegment[]
  interceptionMarker: InterceptionMarker | undefined
  interceptingRoute: AppRoute | undefined
  interceptedRoute: AppRoute | undefined
}

export type NormalizedAppRoute = Omit<AppRoute, 'normalized' | 'segments'> & {
  normalized: true
  segments: NormalizedAppRouteSegment[]
}

export function isNormalizedAppRoute(
  route: InterceptionAppRoute
): route is NormalizedInterceptionAppRoute
export function isNormalizedAppRoute(
  route: AppRoute | InterceptionAppRoute
): route is NormalizedAppRoute {
  return route.normalized
}

export type InterceptionAppRoute = Omit<
  AppRoute,
  'interceptionMarker' | 'interceptingRoute' | 'interceptedRoute'
> & {
  interceptionMarker: InterceptionMarker
  interceptingRoute: AppRoute
  interceptedRoute: AppRoute
}

export type NormalizedInterceptionAppRoute = Omit<
  InterceptionAppRoute,
  | 'normalized'
  | 'segments'
  | 'interceptionMarker'
  | 'interceptingRoute'
  | 'interceptedRoute'
> & {
  normalized: true
  segments: NormalizedAppRouteSegment[]
  interceptionMarker: InterceptionMarker
  interceptingRoute: NormalizedAppRoute
  interceptedRoute: NormalizedAppRoute
}

export function isInterceptionAppRoute(
  route: NormalizedAppRoute
): route is NormalizedInterceptionAppRoute
export function isInterceptionAppRoute(
  route: AppRoute
): route is InterceptionAppRoute {
  return (
    route.interceptionMarker !== undefined &&
    route.interceptingRoute !== undefined &&
    route.interceptedRoute !== undefined
  )
}

// Bitmask for which non-URL segment types to allow during parsing.
// By default, route groups and parallel routes are rejected because
// they should have been stripped by normalizeAppPath. These flags
// let callers opt in to allowing specific types.
const OnlyRoutableSegments = /*   */ 0b00
const AllowParallelSegments = /*  */ 0b01
const AllowGroupSegments = /*     */ 0b10

function parseAppRouteImpl(
  pathname: string,
  allowedTypes: number
): AppRoute | NormalizedAppRoute {
  const pathnameSegments = pathname.split('/').filter(Boolean)

  // Build segments array with static and dynamic segments
  const segments: AppRouteSegment[] = []

  // Parse if this is an interception route.
  let interceptionMarker: InterceptionMarker | undefined
  let interceptingRoute: AppRoute | NormalizedAppRoute | undefined
  let interceptedRoute: AppRoute | NormalizedAppRoute | undefined

  for (const segment of pathnameSegments) {
    const normalizedSegment = normalizeEncodedDynamicPlaceholder(segment)

    // Parse the segment into an AppSegment.
    const appSegment = parseAppRouteSegment(normalizedSegment)
    if (!appSegment) {
      continue
    }

    if (
      appSegment.type === 'route-group' &&
      !(allowedTypes & AllowGroupSegments)
    ) {
      throw new InvariantError(
        `${pathname} is being parsed as a normalized route, but it has a route group segment.`
      )
    }

    if (
      appSegment.type === 'parallel-route' &&
      !(allowedTypes & AllowParallelSegments)
    ) {
      throw new InvariantError(
        `${pathname} is being parsed as a normalized route, but it has a parallel route segment.`
      )
    }

    segments.push(appSegment)

    if (appSegment.interceptionMarker) {
      const parts = pathname.split(appSegment.interceptionMarker)
      if (parts.length !== 2) {
        throw new Error(`Invalid interception route: ${pathname}`)
      }

      interceptingRoute = parseAppRouteImpl(parts[0], allowedTypes)
      interceptedRoute = parseAppRouteImpl(parts[1], allowedTypes)
      interceptionMarker = appSegment.interceptionMarker
    }
  }

  const dynamicSegments = segments.filter(
    (segment) => segment.type === 'dynamic'
  )

  return {
    normalized: allowedTypes === OnlyRoutableSegments,
    pathname,
    segments,
    dynamicSegments,
    interceptionMarker,
    interceptingRoute,
    interceptedRoute,
  }
}

/**
 * Parse an app route that has been fully normalized (no @slot or ()
 * group segments). Throws if either is present.
 */
export function parseNormalizedAppRoute(pathname: string): NormalizedAppRoute {
  return parseAppRouteImpl(pathname, OnlyRoutableSegments) as NormalizedAppRoute
}

/**
 * Parse an app route that may contain @slot segments but not ()
 * group segments. Slot segments are preserved as parallel-route
 * type segments so callers can distinguish routes in different
 * parallel slots.
 */
export function parseAppRouteWithSlots(pathname: string): AppRoute {
  return parseAppRouteImpl(pathname, AllowParallelSegments) as AppRoute
}
