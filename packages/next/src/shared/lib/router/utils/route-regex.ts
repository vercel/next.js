import {
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
} from '../../../../lib/constants'
import { INTERCEPTION_ROUTE_MARKERS } from '../../../../server/lib/interception-routes'
import { escapeStringRegexp } from '../../escape-regexp'
import { removeTrailingSlash } from './remove-trailing-slash'

export interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export interface RouteRegex {
  groups: { [groupName: string]: Group }
  re: RegExp
}

type GetNamedRouteRegexOptions = {
  /**
   * Whether to prefix the route keys with the NEXT_INTERCEPTION_MARKER_PREFIX
   * or NEXT_QUERY_PARAM_PREFIX. This is only relevant when creating the
   * routes-manifest during the build.
   */
  prefixRouteKeys: boolean

  /**
   * Whether to include the suffix in the route regex. This means that when you
   * have something like `/[...slug].json` the `.json` part will be included
   * in the regex, yielding `/(.*).json` as the regex.
   */
  includeSuffix?: boolean

  /**
   * Whether to include the prefix in the route regex. This means that when you
   * have something like `/[...slug].json` the `/` part will be included
   * in the regex, yielding `^/(.*).json$` as the regex.
   *
   * Note that interception markers will already be included without the need
   */
  includePrefix?: boolean

  /**
   * Whether to exclude the optional trailing slash from the route regex.
   */
  excludeOptionalTrailingSlash?: boolean

  /**
   * Whether to backtrack duplicate keys. This is only relevant when creating
   * the routes-manifest during the build.
   */
  backreferenceDuplicateKeys?: boolean
}

type GetRouteRegexOptions = {
  /**
   * Whether to include extra parts in the route regex. This means that when you
   * have something like `/[...slug].json` the `.json` part will be included
   * in the regex, yielding `/(.*).json` as the regex.
   */
  includeSuffix?: boolean

  /**
   * Whether to include the prefix in the route regex. This means that when you
   * have something like `/[...slug].json` the `/` part will be included
   * in the regex, yielding `^/(.*).json$` as the regex.
   *
   * Note that interception markers will already be included without the need
   * of adding this option.
   */
  includePrefix?: boolean

  /**
   * Whether to exclude the optional trailing slash from the route regex.
   */
  excludeOptionalTrailingSlash?: boolean
}

/**
 * Regular expression pattern used to match route parameters.
 * Matches both single parameters and parameter groups.
 * Examples:
 *   - `[[...slug]]` matches parameter group with key 'slug', repeat: true, optional: true
 *   - `[...slug]` matches parameter group with key 'slug', repeat: true, optional: false
 *   - `[[foo]]` matches parameter with key 'foo', repeat: false, optional: true
 *   - `[bar]` matches parameter with key 'bar', repeat: false, optional: false
 */
const PARAMETER_PATTERN = /^([^[]*)\[((?:\[[^\]]*\])|[^\]]+)\](.*)$/

/**
 * Parses a given parameter from a route to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[[...slug]]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[[foo]]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `[bar]` -> `{ key: 'bar', repeat: false, optional: false }`
 *   - `fizz` -> `{ key: 'fizz', repeat: false, optional: false }`
 * @param param - The parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
export function parseParameter(param: string) {
  const match = param.match(PARAMETER_PATTERN)

  if (!match) {
    return parseMatchedParameter(param)
  }

  return parseMatchedParameter(match[2])
}

/**
 * Parses a matched parameter from the PARAMETER_PATTERN regex to a data structure that can be used
 * to generate the parametrized route.
 * Examples:
 *   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
 *   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
 *   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
 *   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
 * @param param - The matched parameter to parse.
 * @returns The parsed parameter as a data structure.
 */
function parseMatchedParameter(param: string) {
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

function getParametrizedRoute(
  route: string,
  includeSuffix: boolean,
  includePrefix: boolean
) {
  const groups: { [groupName: string]: Group } = {}
  let groupIndex = 1

  const segments: string[] = []
  for (const segment of removeTrailingSlash(route).slice(1).split('/')) {
    const markerMatch = INTERCEPTION_ROUTE_MARKERS.find((m) =>
      segment.startsWith(m)
    )
    const paramMatches = segment.match(PARAMETER_PATTERN) // Check for parameters

    if (markerMatch && paramMatches && paramMatches[2]) {
      const { key, optional, repeat } = parseMatchedParameter(paramMatches[2])
      groups[key] = { pos: groupIndex++, repeat, optional }
      segments.push(`/${escapeStringRegexp(markerMatch)}([^/]+?)`)
    } else if (paramMatches && paramMatches[2]) {
      const { key, repeat, optional } = parseMatchedParameter(paramMatches[2])
      groups[key] = { pos: groupIndex++, repeat, optional }

      if (includePrefix && paramMatches[1]) {
        segments.push(`/${escapeStringRegexp(paramMatches[1])}`)
      }

      let s = repeat ? (optional ? '(?:/(.+?))?' : '/(.+?)') : '/([^/]+?)'

      // Remove the leading slash if includePrefix already added it.
      if (includePrefix && paramMatches[1]) {
        s = s.substring(1)
      }

      segments.push(s)
    } else {
      segments.push(`/${escapeStringRegexp(segment)}`)
    }

    // If there's a suffix, add it to the segments if it's enabled.
    if (includeSuffix && paramMatches && paramMatches[3]) {
      segments.push(escapeStringRegexp(paramMatches[3]))
    }
  }

  return {
    parameterizedRoute: segments.join(''),
    groups,
  }
}

/**
 * From a normalized route this function generates a regular expression and
 * a corresponding groups object intended to be used to store matching groups
 * from the regular expression.
 */
export function getRouteRegex(
  normalizedRoute: string,
  {
    includeSuffix = false,
    includePrefix = false,
    excludeOptionalTrailingSlash = false,
  }: GetRouteRegexOptions = {}
): RouteRegex {
  const { parameterizedRoute, groups } = getParametrizedRoute(
    normalizedRoute,
    includeSuffix,
    includePrefix
  )

  let re = parameterizedRoute
  if (!excludeOptionalTrailingSlash) {
    re += '(?:/)?'
  }

  return {
    re: new RegExp(`^${re}$`),
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
  backreferenceDuplicateKeys,
}: {
  interceptionMarker?: string
  getSafeRouteKey: () => string
  segment: string
  routeKeys: Record<string, string>
  keyPrefix?: string
  backreferenceDuplicateKeys: boolean
}) {
  const { key, optional, repeat } = parseMatchedParameter(segment)

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

  const duplicateKey = cleanedKey in routeKeys

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

  let pattern: string
  if (duplicateKey && backreferenceDuplicateKeys) {
    // Use a backreference to the key to ensure that the key is the same value
    // in each of the placeholders.
    pattern = `\\k<${cleanedKey}>`
  } else if (repeat) {
    pattern = `(?<${cleanedKey}>.+?)`
  } else {
    pattern = `(?<${cleanedKey}>[^/]+?)`
  }

  return optional
    ? `(?:/${interceptionPrefix}${pattern})?`
    : `/${interceptionPrefix}${pattern}`
}

function getNamedParametrizedRoute(
  route: string,
  prefixRouteKeys: boolean,
  includeSuffix: boolean,
  includePrefix: boolean,
  backreferenceDuplicateKeys: boolean
) {
  const getSafeRouteKey = buildGetSafeRouteKey()
  const routeKeys: { [named: string]: string } = {}

  const segments: string[] = []
  for (const segment of removeTrailingSlash(route).slice(1).split('/')) {
    const hasInterceptionMarker = INTERCEPTION_ROUTE_MARKERS.some((m) =>
      segment.startsWith(m)
    )

    const paramMatches = segment.match(PARAMETER_PATTERN) // Check for parameters

    if (hasInterceptionMarker && paramMatches && paramMatches[2]) {
      // If there's an interception marker, add it to the segments.
      segments.push(
        getSafeKeyFromSegment({
          getSafeRouteKey,
          interceptionMarker: paramMatches[1],
          segment: paramMatches[2],
          routeKeys,
          keyPrefix: prefixRouteKeys
            ? NEXT_INTERCEPTION_MARKER_PREFIX
            : undefined,
          backreferenceDuplicateKeys,
        })
      )
    } else if (paramMatches && paramMatches[2]) {
      // If there's a prefix, add it to the segments if it's enabled.
      if (includePrefix && paramMatches[1]) {
        segments.push(`/${escapeStringRegexp(paramMatches[1])}`)
      }

      let s = getSafeKeyFromSegment({
        getSafeRouteKey,
        segment: paramMatches[2],
        routeKeys,
        keyPrefix: prefixRouteKeys ? NEXT_QUERY_PARAM_PREFIX : undefined,
        backreferenceDuplicateKeys,
      })

      // Remove the leading slash if includePrefix already added it.
      if (includePrefix && paramMatches[1]) {
        s = s.substring(1)
      }

      segments.push(s)
    } else {
      segments.push(`/${escapeStringRegexp(segment)}`)
    }

    // If there's a suffix, add it to the segments if it's enabled.
    if (includeSuffix && paramMatches && paramMatches[3]) {
      segments.push(escapeStringRegexp(paramMatches[3]))
    }
  }

  return {
    namedParameterizedRoute: segments.join(''),
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
  options: GetNamedRouteRegexOptions
) {
  const result = getNamedParametrizedRoute(
    normalizedRoute,
    options.prefixRouteKeys,
    options.includeSuffix ?? false,
    options.includePrefix ?? false,
    options.backreferenceDuplicateKeys ?? false
  )

  let namedRegex = result.namedParameterizedRoute
  if (!options.excludeOptionalTrailingSlash) {
    namedRegex += '(?:/)?'
  }

  return {
    ...getRouteRegex(normalizedRoute, options),
    namedRegex: `^${namedRegex}$`,
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
  const { parameterizedRoute } = getParametrizedRoute(
    normalizedRoute,
    false,
    false
  )
  const { catchAll = true } = options
  if (parameterizedRoute === '/') {
    let catchAllRegex = catchAll ? '.*' : ''
    return {
      namedRegex: `^/${catchAllRegex}$`,
    }
  }

  const { namedParameterizedRoute } = getNamedParametrizedRoute(
    normalizedRoute,
    false,
    false,
    false,
    false
  )
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''
  return {
    namedRegex: `^${namedParameterizedRoute}${catchAllGroupedRegex}$`,
  }
}
