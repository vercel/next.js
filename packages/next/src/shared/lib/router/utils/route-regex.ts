import { INTERCEPTION_ROUTE_MARKERS } from '../../../../server/future/helpers/interception-routes'
import { escapeStringRegexp } from '../../escape-regexp'
import { removeTrailingSlash } from './remove-trailing-slash'

const NEXT_QUERY_PARAM_PREFIX = 'nxtP'
const NEXT_INTERCEPTION_MARKER_PREFIX = 'nxtI'

export interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export interface RouteRegex {
  groups: { [groupName: string]: Group }
  re: RegExp
}

/**
 * Parses a given parameter from a route to a data structure that can be used
 * to generate the parametrized route. Examples:
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
 */
function parseParameter(param: string) {
  const optional = param.startsWith('[') && param.endsWith(']')
  if (optional) {
    param = param.slice(1, -1)
  }
  const repeat = param.startsWith('...')
  if (repeat) {
    param = param.slice(3)
  }
  return { key: param, repeat, optional }
}

function getParametrizedRoute(route: string) {
  const segments = removeTrailingSlash(route).slice(1).split('/')
  const groups: { [groupName: string]: Group } = {}
  let groupIndex = 1
  return {
    parameterizedRoute: segments
      .map((segment) => {
        const markerMatch = INTERCEPTION_ROUTE_MARKERS.find((m) =>
          segment.startsWith(m)
        )
        const paramMatches = segment.match(/\[((?:\[.*\])|.+)\]/) // Check for parameters

        if (markerMatch && paramMatches) {
          const { key, optional, repeat } = parseParameter(paramMatches[1])
          groups[key] = { pos: groupIndex++, repeat, optional }
          return `/${escapeStringRegexp(markerMatch)}([^/]+?)`
        } else if (paramMatches) {
          const { key, repeat, optional } = parseParameter(paramMatches[1])
          groups[key] = { pos: groupIndex++, repeat, optional }
          return repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'
        } else {
          return `/${escapeStringRegexp(segment)}`
        }
      })
      .join(''),
    groups,
  }
}

/**
 * From a normalized route this function generates a regular expression and
 * a corresponding groups object intended to be used to store matching groups
 * from the regular expression.
 */
export function getRouteRegex(normalizedRoute: string): RouteRegex {
  const { parameterizedRoute, groups } = getParametrizedRoute(normalizedRoute)
  return {
    re: new RegExp(`^${parameterizedRoute}(?:/)?$`),
    groups: groups,
  }
}

/**
 * Builds a function to generate a minimal routeKey using only a-z and minimal
 * number of characters.
 */
function buildGetSafeRouteKey() {
  let i = 0

  return () => {
    let routeKey = ''
    let j = ++i
    while (j > 0) {
      routeKey += String.fromCharCode(97 + ((j - 1) % 26))
      j = Math.floor((j - 1) / 26)
    }
    return routeKey
  }
}

function getSafeKeyFromSegment({
  interceptionMarker,
  getSafeRouteKey,
  segment,
  routeKeys,
  keyPrefix,
}: {
  interceptionMarker?: string
  getSafeRouteKey: () => string
  segment: string
  routeKeys: Record<string, string>
  keyPrefix?: string
}) {
  const { key, optional, repeat } = parseParameter(segment)

  // replace any non-word characters since they can break
  // the named regex
  let cleanedKey = key.replace(/\W/g, '')

  if (keyPrefix) {
    cleanedKey = `${keyPrefix}${cleanedKey}`
  }
  let invalidKey = false

  // check if the key is still invalid and fallback to using a known
  // safe key
  if (cleanedKey.length === 0 || cleanedKey.length > 30) {
    invalidKey = true
  }
  if (!isNaN(parseInt(cleanedKey.slice(0, 1)))) {
    invalidKey = true
  }

  if (invalidKey) {
    cleanedKey = getSafeRouteKey()
  }

  if (keyPrefix) {
    routeKeys[cleanedKey] = `${keyPrefix}${key}`
  } else {
    routeKeys[cleanedKey] = key
  }

  // if the segment has an interception marker, make sure that's part of the regex pattern
  // this is to ensure that the route with the interception marker doesn't incorrectly match
  // the non-intercepted route (ie /app/(.)[username] should not match /app/[username])
  const interceptionPrefix = interceptionMarker
    ? escapeStringRegexp(interceptionMarker)
    : ''

  return repeat
    ? optional
      ? `(?:/${interceptionPrefix}(?<${cleanedKey}>.+?))?`
      : `/${interceptionPrefix}(?<${cleanedKey}>.+?)`
    : `/${interceptionPrefix}(?<${cleanedKey}>[^/]+?)`
}

function getNamedParametrizedRoute(route: string, prefixRouteKeys: boolean) {
  const segments = removeTrailingSlash(route).slice(1).split('/')
  const getSafeRouteKey = buildGetSafeRouteKey()
  const routeKeys: { [named: string]: string } = {}
  return {
    namedParameterizedRoute: segments
      .map((segment) => {
        const hasInterceptionMarker = INTERCEPTION_ROUTE_MARKERS.some((m) =>
          segment.startsWith(m)
        )
        const paramMatches = segment.match(/\[((?:\[.*\])|.+)\]/) // Check for parameters

        if (hasInterceptionMarker && paramMatches) {
          const [usedMarker] = segment.split(paramMatches[0])

          return getSafeKeyFromSegment({
            getSafeRouteKey,
            interceptionMarker: usedMarker,
            segment: paramMatches[1],
            routeKeys,
            keyPrefix: prefixRouteKeys
              ? NEXT_INTERCEPTION_MARKER_PREFIX
              : undefined,
          })
        } else if (paramMatches) {
          return getSafeKeyFromSegment({
            getSafeRouteKey,
            segment: paramMatches[1],
            routeKeys,
            keyPrefix: prefixRouteKeys ? NEXT_QUERY_PARAM_PREFIX : undefined,
          })
        } else {
          return `/${escapeStringRegexp(segment)}`
        }
      })
      .join(''),
    routeKeys,
  }
}

/**
 * This function extends `getRouteRegex` generating also a named regexp where
 * each group is named along with a routeKeys object that indexes the assigned
 * named group with its corresponding key. When the routeKeys need to be
 * prefixed to uniquely identify internally the "prefixRouteKey" arg should
 * be "true" currently this is only the case when creating the routes-manifest
 * during the build
 */
export function getNamedRouteRegex(
  normalizedRoute: string,
  prefixRouteKey: boolean
) {
  const result = getNamedParametrizedRoute(normalizedRoute, prefixRouteKey)
  return {
    ...getRouteRegex(normalizedRoute),
    namedRegex: `^${result.namedParameterizedRoute}(?:/)?$`,
    routeKeys: result.routeKeys,
  }
}

/**
 * Generates a named regexp.
 * This is intended to be using for build time only.
 */
export function getNamedMiddlewareRegex(
  normalizedRoute: string,
  options: {
    catchAll?: boolean
  }
) {
  const { parameterizedRoute } = getParametrizedRoute(normalizedRoute)
  const { catchAll = true } = options
  if (parameterizedRoute === '/') {
    let catchAllRegex = catchAll ? '.*' : ''
    return {
      namedRegex: `^/${catchAllRegex}$`,
    }
  }

  const { namedParameterizedRoute } = getNamedParametrizedRoute(
    normalizedRoute,
    false
  )
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''
  return {
    namedRegex: `^${namedParameterizedRoute}${catchAllGroupedRegex}$`,
  }
}
