import {
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
} from '../../../../lib/constants'
import { INTERCEPTION_ROUTE_MARKERS } from './interception-routes'
import { escapeStringRegexp } from '../../escape-regexp'
import { removeTrailingSlash } from './remove-trailing-slash'
import { PARAMETER_PATTERN, parseMatchedParameter } from './get-dynamic-param'

export interface Group {
  pos: number
  repeat: boolean
  optional: boolean
}

export interface RouteRegex {
  groups: { [groupName: string]: Group }
  re: RegExp
}

export type RegexReference = {
  names: Record<string, string>
  intercepted: Record<string, string>
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

  /**
   * If provided, this will be used as the reference for the dynamic parameter
   * keys instead of generating them in context. This is currently only used for
   * interception routes.
   */
  reference?: RegexReference
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

  return {
    key,
    pattern: optional
      ? `(?:/${interceptionPrefix}${pattern})?`
      : `/${interceptionPrefix}${pattern}`,
    cleanedKey: cleanedKey,
    optional,
    repeat,
  }
}

function getNamedParametrizedRoute(
  route: string,
  prefixRouteKeys: boolean,
  includeSuffix: boolean,
  includePrefix: boolean,
  backreferenceDuplicateKeys: boolean,
  reference: RegexReference = { names: {}, intercepted: {} }
) {
  const getSafeRouteKey = buildGetSafeRouteKey()
  const routeKeys: { [named: string]: string } = {}

  const segments: string[] = []
  const inverseParts: string[] = []

  // Ensure we don't mutate the original reference object.
  reference = structuredClone(reference)

  for (const segment of removeTrailingSlash(route).slice(1).split('/')) {
    const hasInterceptionMarker = INTERCEPTION_ROUTE_MARKERS.some((m) =>
      segment.startsWith(m)
    )

    const paramMatches = segment.match(PARAMETER_PATTERN) // Check for parameters

    const interceptionMarker = hasInterceptionMarker
      ? paramMatches?.[1]
      : undefined

    let keyPrefix: string | undefined
    if (interceptionMarker && paramMatches?.[2]) {
      keyPrefix = prefixRouteKeys ? NEXT_INTERCEPTION_MARKER_PREFIX : undefined
      reference.intercepted[paramMatches[2]] = interceptionMarker
    } else if (paramMatches?.[2] && reference.intercepted[paramMatches[2]]) {
      keyPrefix = prefixRouteKeys ? NEXT_INTERCEPTION_MARKER_PREFIX : undefined
    } else {
      keyPrefix = prefixRouteKeys ? NEXT_QUERY_PARAM_PREFIX : undefined
    }

    if (interceptionMarker && paramMatches && paramMatches[2]) {
      // If there's an interception marker, add it to the segments.
      const { key, pattern, cleanedKey, repeat, optional } =
        getSafeKeyFromSegment({
          getSafeRouteKey,
          interceptionMarker,
          segment: paramMatches[2],
          routeKeys,
          keyPrefix,
          backreferenceDuplicateKeys,
        })

      segments.push(pattern)
      inverseParts.push(
        `/${paramMatches[1]}:${reference.names[key] ?? cleanedKey}${repeat ? (optional ? '*' : '+') : ''}`
      )
      reference.names[key] ??= cleanedKey
    } else if (paramMatches && paramMatches[2]) {
      // If there's a prefix, add it to the segments if it's enabled.
      if (includePrefix && paramMatches[1]) {
        segments.push(`/${escapeStringRegexp(paramMatches[1])}`)
        inverseParts.push(`/${paramMatches[1]}`)
      }

      const { key, pattern, cleanedKey, repeat, optional } =
        getSafeKeyFromSegment({
          getSafeRouteKey,
          segment: paramMatches[2],
          routeKeys,
          keyPrefix,
          backreferenceDuplicateKeys,
        })

      // Remove the leading slash if includePrefix already added it.
      let s = pattern
      if (includePrefix && paramMatches[1]) {
        s = s.substring(1)
      }

      segments.push(s)
      inverseParts.push(
        `/:${reference.names[key] ?? cleanedKey}${repeat ? (optional ? '*' : '+') : ''}`
      )
      reference.names[key] ??= cleanedKey
    } else {
      segments.push(`/${escapeStringRegexp(segment)}`)
      inverseParts.push(`/${segment}`)
    }

    // If there's a suffix, add it to the segments if it's enabled.
    if (includeSuffix && paramMatches && paramMatches[3]) {
      segments.push(escapeStringRegexp(paramMatches[3]))
      inverseParts.push(paramMatches[3])
    }
  }

  return {
    namedParameterizedRoute: segments.join(''),
    routeKeys,
    pathToRegexpPattern: inverseParts.join(''),
    reference,
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
    options.backreferenceDuplicateKeys ?? false,
    options.reference
  )

  let namedRegex = result.namedParameterizedRoute
  if (!options.excludeOptionalTrailingSlash) {
    namedRegex += '(?:/)?'
  }

  return {
    ...getRouteRegex(normalizedRoute, options),
    namedRegex: `^${namedRegex}$`,
    routeKeys: result.routeKeys,
    pathToRegexpPattern: result.pathToRegexpPattern,
    reference: result.reference,
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
    false,
    undefined
  )
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''
  return {
    namedRegex: `^${namedParameterizedRoute}${catchAllGroupedRegex}$`,
  }
}
