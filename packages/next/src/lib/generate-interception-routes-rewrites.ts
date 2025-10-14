import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
  INTERCEPTION_ROUTE_MARKERS,
} from '../shared/lib/router/utils/interception-routes'
import type { Rewrite } from './load-custom-routes'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'
import {
  getSegmentParam,
  isCatchAll,
} from '../shared/lib/router/utils/get-segment-param'
import { InvariantError } from '../shared/lib/invariant-error'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'

/**
 * Detects which interception marker is used in the app path
 */
function getInterceptionMarker(
  appPath: string
): (typeof INTERCEPTION_ROUTE_MARKERS)[number] | undefined {
  for (const segment of appPath.split('/')) {
    const marker = INTERCEPTION_ROUTE_MARKERS.find((m) => segment.startsWith(m))
    if (marker) {
      return marker
    }
  }
  return undefined
}

/**
 * Generates a regex pattern that matches routes at the same level as the intercepting route.
 * For (.) same-level interception, we need to match:
 * - The intercepting route itself
 * - Any direct child of the intercepting route
 * But NOT deeper nested routes
 */
function generateSameLevelHeaderRegex(
  interceptingRoute: string,
  reference: Record<string, string>
): string {
  // Build the pattern for matching the intercepting route and its direct children
  const segments =
    interceptingRoute === '/'
      ? []
      : interceptingRoute.split('/').filter(Boolean)

  const patterns: string[] = []
  const optionalIndices: number[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const param = getSegmentParam(segment)
    if (param) {
      // Dynamic segment - use named capture group
      // Use the reference mapping which has the correct param -> prefixedKey mapping
      const prefixedKey = reference[param.param]
      if (!prefixedKey) {
        throw new InvariantError(
          `No reference found for param: ${param.param} in reference: ${JSON.stringify(reference)}`
        )
      }

      // Check if this is a catchall (repeat) parameter
      if (isCatchAll(param.type)) {
        patterns.push(`(?<${prefixedKey}>.+?)`)
        // Track optional catchall segments so we can wrap them later
        if (param.type === 'optional-catchall') {
          optionalIndices.push(i)
        }
      } else {
        patterns.push(`(?<${prefixedKey}>[^/]+?)`)
      }
    } else {
      // Static segment
      patterns.push(escapeStringRegexp(segment))
    }
  }

  // Build the header regex, wrapping optional catchall segments
  let pattern = ''
  for (let i = 0; i < patterns.length; i++) {
    if (optionalIndices.includes(i)) {
      // Optional catchall: wrap the segment with its leading / in an optional group
      pattern += `(?:/${patterns[i]})?`
    } else {
      pattern += `/${patterns[i]}`
    }
  }

  // Match the pattern, optionally followed by a single segment, with optional trailing slash
  // Note: Don't add ^ and $ anchors here - matchHas() will add them automatically
  return `${pattern}(/[^/]+)?/?`
}

/**
 * Check if there's a catchall route sibling at the intercepting route level.
 * For example, if interceptingRoute is '/templates', this checks for
 * '/templates/[...catchAll]'.
 */
function hasCatchallSiblingAtLevel(
  appPaths: string[],
  interceptingRoute: string
): boolean {
  const targetSegments =
    interceptingRoute === '/'
      ? []
      : interceptingRoute.split('/').filter(Boolean)
  const targetDepth = targetSegments.length

  return appPaths.some((path) => {
    const segments = path.split('/').filter(Boolean)

    // Check if this path is at the same depth + 1 (parent segments + the catchall segment)
    if (segments.length !== targetDepth + 1) {
      return false
    }

    // Check if the first targetDepth segments match exactly
    for (let i = 0; i < targetDepth; i++) {
      // Skip interception routes
      if (
        INTERCEPTION_ROUTE_MARKERS.some((marker) =>
          segments[i].startsWith(marker)
        )
      ) {
        return false
      }

      if (segments[i] !== targetSegments[i]) {
        return false
      }
    }

    // Check if the last segment is a catchall parameter
    const lastSegment = segments[segments.length - 1]
    const param = getSegmentParam(lastSegment)
    return param !== null && isCatchAll(param.type)
  })
}

/**
 * Generates the appropriate header regex based on the interception marker type.
 * @param marker The interception route marker (e.g., '(.)', '(..)'))
 * @param interceptingRoute The route that intercepts (e.g., '/templates')
 * @param headerReference The reference mapping from param names to prefixed keys
 * @param appPaths All app paths (used for catchall sibling detection)
 * @param defaultHeaderRegex The default regex to use if no marker-specific logic applies
 * @returns The header regex pattern to match against the Next-URL header
 */
function generateInterceptionHeaderRegex(
  marker: (typeof INTERCEPTION_ROUTE_MARKERS)[number] | undefined,
  interceptingRoute: string,
  headerReference: Record<string, string>,
  appPaths: string[],
  defaultHeaderRegex: string
): string {
  // Generate the appropriate header regex based on the marker type
  let headerRegex: string
  if (marker === '(.)') {
    // For same-level interception, match routes at the same level as the intercepting route
    // Use header.reference which has the param -> prefixedKey mapping
    headerRegex = generateSameLevelHeaderRegex(
      interceptingRoute,
      headerReference
    )
  } else if (marker === '(..)') {
    // For parent-level interception, match routes at the intercepting route level
    // Check if there's a catchall sibling at the intercepting route level
    const hasCatchallSibling = hasCatchallSiblingAtLevel(
      appPaths,
      interceptingRoute
    )

    // Build regex pattern that handles dynamic segments correctly
    const patterns: string[] = []
    const optionalIndices: number[] = []

    const segments = interceptingRoute.split('/').filter(Boolean)
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const param = getSegmentParam(segment)
      if (param) {
        // Dynamic segment - use named capture group from header.reference
        const key = headerReference[param.param]
        if (!key) {
          throw new InvariantError(
            `No reference found for param: ${param.param} in reference: ${JSON.stringify(headerReference)}`
          )
        }

        // Check if this is a catchall (repeat) parameter
        if (isCatchAll(param.type)) {
          patterns.push(`(?<${key}>.+?)`)
          // Track optional catchall segments so we can wrap them later
          if (param.type === 'optional-catchall') {
            optionalIndices.push(i)
          }
        } else {
          patterns.push(`(?<${key}>[^/]+?)`)
        }
      } else {
        // Static segment
        patterns.push(escapeStringRegexp(segment))
      }
    }

    // Build the header regex, wrapping optional catchall segments
    let headerPattern = ''
    for (let i = 0; i < patterns.length; i++) {
      if (optionalIndices.includes(i)) {
        // Optional catchall: wrap the segment with its leading / in an optional group
        headerPattern += `(?:/${patterns[i]})?`
      } else {
        headerPattern += `/${patterns[i]}`
      }
    }

    // Note: Don't add ^ and $ anchors - matchHas() will add them automatically
    // If there's a catchall sibling, match the level and its children (catchall paths)
    // Otherwise, only match the exact level
    headerRegex = `${headerPattern}${hasCatchallSibling ? '(/.+)?' : ''}`
  } else {
    // For other markers, use the default behavior (match exact intercepting route)
    // Strip ^ and $ anchors since matchHas() will add them automatically
    headerRegex = defaultHeaderRegex
  }

  return headerRegex
}

export function generateInterceptionRoutesRewrites(
  appPaths: string[],
  basePath = ''
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      // Detect which marker is being used
      const marker = getInterceptionMarker(appPath)

      // The Next-Url header does not contain the base path, so just use the
      // intercepting route. We don't handle duplicate keys here with the
      // backreferenceDuplicateKeys option because it's not a valid pathname
      // with them in this case.
      const header = getNamedRouteRegex(interceptingRoute, {
        prefixRouteKeys: true,
      })

      // The source is the intercepted route with the base path, it's matched by
      // the router. Generate this first to get the correct parameter prefixes.
      // We don't handle duplicate keys here with the backreferenceDuplicateKeys
      // option because it's not a valid pathname with them in this case.
      const source = getNamedRouteRegex(basePath + interceptedRoute, {
        prefixRouteKeys: true,
      })

      // The destination should use the same parameter reference as the source
      // so that parameter substitution works correctly. This ensures that when
      // the router extracts params from the source, they can be substituted
      // into the destination. We don't handle duplicate keys here with the
      // backreferenceDuplicateKeys option because we don't use the regexp
      // itself in this case, only the pathToRegexpPattern.
      const destination = getNamedRouteRegex(basePath + appPath, {
        prefixRouteKeys: true,
        reference: source.reference,
      })

      // Generate the header regex based on the interception marker type
      const headerRegex = generateInterceptionHeaderRegex(
        marker,
        interceptingRoute,
        header.reference,
        appPaths,
        header.namedRegex.replace(/^\^/, '').replace(/\$$/, '')
      )

      rewrites.push({
        source: source.pathToRegexpPattern,
        destination: destination.pathToRegexpPattern,
        has: [
          {
            type: 'header',
            key: NEXT_URL,
            value: headerRegex,
          },
        ],
        internal: true,
        regex: source.namedRegex,
      })
    }
  }

  return rewrites
}

export function isInterceptionRouteRewrite(route: DeepReadonly<Rewrite>) {
  // When we generate interception rewrites in the above implementation, we always do so with only a single `has` condition.
  return route.has?.[0]?.key === NEXT_URL
}
