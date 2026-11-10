import { normalizeAppPath } from './app-paths'

// order matters here, the first match will be used
export const INTERCEPTION_ROUTE_MARKERS = [
  '(..)(..)',
  '(.)',
  '(..)',
  '(...)',
] as const

export type InterceptionMarker = (typeof INTERCEPTION_ROUTE_MARKERS)[number]

export type MissingCanonicalInterceptionRoute = {
  interceptionRoute: string
  canonicalRoute: string
}

type RoutePattern = {
  prefix: Array<string | null>
  minLength: number
  unbounded: boolean
}

function parseRoutePattern(route: string): RoutePattern {
  const segments = route.split('/').filter(Boolean)
  const tail = segments.at(-1)
  const isOptionalCatchAll =
    tail !== undefined && tail.startsWith('[[...') && tail.endsWith(']]')
  const isCatchAll =
    tail !== undefined && tail.startsWith('[...') && tail.endsWith(']')
  const unbounded = isOptionalCatchAll || isCatchAll
  const prefixSegments = unbounded ? segments.slice(0, -1) : segments

  return {
    prefix: prefixSegments.map((segment) =>
      segment.startsWith('[') && segment.endsWith(']') ? null : segment
    ),
    minLength:
      prefixSegments.length + (isCatchAll && !isOptionalCatchAll ? 1 : 0),
    unbounded,
  }
}

function acceptsLength(pattern: RoutePattern, length: number): boolean {
  return pattern.unbounded
    ? length >= pattern.minLength
    : length === pattern.minLength
}

function prefixCovers(
  canonical: RoutePattern,
  intercepted: RoutePattern
): boolean {
  return canonical.prefix.every((canonicalSegment, index) => {
    if (canonicalSegment === null) return true

    const interceptedSegment = intercepted.prefix[index]
    return (
      interceptedSegment !== undefined &&
      interceptedSegment !== null &&
      canonicalSegment === interceptedSegment
    )
  })
}

function patternCoversAtLength(
  canonical: RoutePattern,
  intercepted: RoutePattern,
  length: number
): boolean {
  return (
    acceptsLength(canonical, length) &&
    acceptsLength(intercepted, length) &&
    prefixCovers(canonical, intercepted)
  )
}

/** Returns whether ordinary route patterns cover every URL in `route`. */
function isRoutePatternCovered(route: string, ordinaryRoutes: RoutePattern[]) {
  const intercepted = parseRoutePattern(route)

  if (!intercepted.unbounded) {
    return ordinaryRoutes.some((pattern) =>
      patternCoversAtLength(pattern, intercepted, intercepted.minLength)
    )
  }

  let unboundedCoverageStart = Infinity
  for (const pattern of ordinaryRoutes) {
    if (pattern.unbounded && prefixCovers(pattern, intercepted)) {
      unboundedCoverageStart = Math.min(
        unboundedCoverageStart,
        Math.max(intercepted.minLength, pattern.minLength)
      )
    }
  }

  if (unboundedCoverageStart === Infinity) return false

  // An optional or required catchall can have its shorter paths covered by
  // fixed routes before another catchall takes over the remaining suffix.
  for (
    let length = intercepted.minLength;
    length < unboundedCoverageStart;
    length++
  ) {
    if (
      !ordinaryRoutes.some((pattern) =>
        patternCoversAtLength(pattern, intercepted, length)
      )
    ) {
      return false
    }
  }

  return true
}

export function isInterceptionRouteAppPath(path: string): boolean {
  // TODO-APP: add more serious validation
  return (
    path
      .split('/')
      .find((segment) =>
        INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
      ) !== undefined
  )
}

type InterceptionRouteInformation = {
  /**
   * The intercepting route. This is the route that is being intercepted or the
   * route that the user was coming from. This is matched by the Next-Url
   * header.
   */
  interceptingRoute: string

  /**
   * The intercepted route. This is the route that is being intercepted or the
   * route that the user is going to. This is matched by the request pathname.
   */
  interceptedRoute: string
}

export function extractInterceptionRouteInformation(
  path: string
): InterceptionRouteInformation {
  let interceptingRoute: string | undefined
  let marker: (typeof INTERCEPTION_ROUTE_MARKERS)[number] | undefined
  let interceptedRoute: string | undefined

  for (const segment of path.split('/')) {
    marker = INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
    if (marker) {
      ;[interceptingRoute, interceptedRoute] = path.split(marker, 2)
      break
    }
  }

  if (!interceptingRoute || !marker || !interceptedRoute) {
    throw new Error(
      `Invalid interception route: ${path}. Must be in the format /<intercepting route>/(..|...|..)(..)/<intercepted route>`
    )
  }

  interceptingRoute = normalizeAppPath(interceptingRoute) // normalize the path, e.g. /(blog)/feed -> /feed

  switch (marker) {
    case '(.)':
      // (.) indicates that we should match with sibling routes, so we just need to append the intercepted route to the intercepting route
      if (interceptingRoute === '/') {
        interceptedRoute = `/${interceptedRoute}`
      } else {
        interceptedRoute = interceptingRoute + '/' + interceptedRoute
      }
      break
    case '(..)':
      // (..) indicates that we should match at one level up, so we need to remove the last segment of the intercepting route
      if (interceptingRoute === '/') {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..) marker at the root level, use (.) instead.`
        )
      }
      interceptedRoute = interceptingRoute
        .split('/')
        .slice(0, -1)
        .concat(interceptedRoute)
        .join('/')
      break
    case '(...)':
      // (...) will match the route segment in the root directory, so we need to use the root directory to prepend the intercepted route
      interceptedRoute = '/' + interceptedRoute
      break
    case '(..)(..)':
      // (..)(..) indicates that we should match at two levels up, so we need to remove the last two segments of the intercepting route

      const splitInterceptingRoute = interceptingRoute.split('/')
      if (splitInterceptingRoute.length <= 2) {
        throw new Error(
          `Invalid interception route: ${path}. Cannot use (..)(..) marker at the root level or one level up.`
        )
      }

      interceptedRoute = splitInterceptingRoute
        .slice(0, -2)
        .concat(interceptedRoute)
        .join('/')
      break
    default:
      throw new Error('Invariant: unexpected marker')
  }

  return { interceptingRoute, interceptedRoute }
}

/**
 * Finds interception matchers that cannot be loaded as an ordinary request.
 *
 * This must run after catch-all normalization and pruning so `appPaths`
 * contains the final matcher set rather than every possible matcher candidate.
 */
export function findMissingCanonicalInterceptionRoutes(
  appPaths: Record<string, string[]>
): MissingCanonicalInterceptionRoute[] {
  const canonicalRoutes = Object.keys(appPaths).filter(
    (route) => !isInterceptionRouteAppPath(route)
  )
  const canonicalRoutePatterns = canonicalRoutes.map(parseRoutePattern)

  return Object.keys(appPaths)
    .filter(isInterceptionRouteAppPath)
    .map((interceptionRoute) => ({
      interceptionRoute,
      canonicalRoute:
        extractInterceptionRouteInformation(interceptionRoute).interceptedRoute,
    }))
    .filter(
      ({ canonicalRoute }) =>
        !isRoutePatternCovered(canonicalRoute, canonicalRoutePatterns)
    )
    .sort((a, b) => a.interceptionRoute.localeCompare(b.interceptionRoute))
}
