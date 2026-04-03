import { NEXT_URL } from '../client/components/app-router-headers'
import {
  extractInterceptionRouteInformation,
  isInterceptionRouteAppPath,
  INTERCEPTION_ROUTE_MARKERS,
} from '../shared/lib/router/utils/interception-routes'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { isGroupSegment } from '../shared/lib/segment'
import type { Rewrite } from './load-custom-routes'
import { getNamedRouteRegex } from '../shared/lib/router/utils/route-regex'

/**
 * Extracts the route group prefix from a denormalized app path.
 * This is the portion of the path before the interception marker,
 * with @-prefixed (parallel route) segments removed but route groups preserved.
 *
 * For example:
 *   `/(group1)/@modal/(.)shared/page` -> `/(group1)`
 *   `/(group2)/@modal/(.)shared/page` -> `/(group2)`
 *   `/@modal/(.)shared` -> null (no route group)
 *   `/foo/@modal/(.)bar` -> null (no route group)
 */
function getRouteGroupPrefix(appPath: string): string | null {
  const segments = appPath.split('/')
  const prefixSegments: string[] = []
  let hasRouteGroup = false

  for (const segment of segments) {
    // Stop when we hit the interception marker
    if (INTERCEPTION_ROUTE_MARKERS.some((m) => segment.startsWith(m))) {
      break
    }
    // Skip @-prefixed segments (parallel routes)
    if (segment.startsWith('@')) {
      continue
    }
    prefixSegments.push(segment)
    if (segment && isGroupSegment(segment)) {
      hasRouteGroup = true
    }
  }

  if (!hasRouteGroup) {
    return null
  }

  return prefixSegments.join('/') || '/'
}

/**
 * Given a route group prefix (e.g., `/(group1)`), finds all non-interception
 * page paths within that group from the full denormalized paths list,
 * normalizes them to URL paths, and returns the longest common URL prefix.
 *
 * This is used to build a more specific Next-Url header regex for interception
 * routes within route groups, so that two different groups intercepting the
 * same path produce distinct rewrite rules.
 */
function findEffectiveInterceptingRoute(
  routeGroupPrefix: string,
  interceptingRoute: string,
  denormalizedPaths: string[]
): string {
  // Find all non-interception app paths under this route group prefix
  const siblingUrls: string[] = []

  // Normalize the prefix for matching (ensure it ends consistently)
  const prefixForMatch = routeGroupPrefix === '/' ? '/' : routeGroupPrefix + '/'

  for (const p of denormalizedPaths) {
    if (isInterceptionRouteAppPath(p)) continue
    // Check if this path is under the same route group
    if (!p.startsWith(prefixForMatch) && p !== routeGroupPrefix) continue
    // Skip default pages (@slot/default)
    if (p.endsWith('/default')) continue

    const normalized = normalizeAppPath(p)
    if (normalized) {
      siblingUrls.push(normalized)
    }
  }

  if (siblingUrls.length === 0) {
    return interceptingRoute
  }

  // Find the longest common prefix among sibling URLs
  let commonPrefix = siblingUrls[0]
  for (let i = 1; i < siblingUrls.length; i++) {
    commonPrefix = longestCommonPrefix(commonPrefix, siblingUrls[i])
    if (commonPrefix === '/') break
  }

  // Only use the common prefix if it's more specific than the original
  // interceptingRoute (i.e., has more path segments)
  if (commonPrefix.length > interceptingRoute.length) {
    return commonPrefix
  }

  return interceptingRoute
}

function longestCommonPrefix(a: string, b: string): string {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++
  }
  // Trim to the last complete path segment
  const prefix = a.substring(0, i)
  const lastSlash = prefix.lastIndexOf('/')
  if (lastSlash <= 0) return '/'
  return prefix.substring(0, lastSlash)
}

/**
 * Given an interception route appPath and its extracted info, generates
 * a single rewrite entry.
 */
function generateRewrite(
  appPath: string,
  interceptingRoute: string,
  interceptedRoute: string,
  basePath: string
): Rewrite {
  const destination = getNamedRouteRegex(basePath + appPath, {
    prefixRouteKeys: true,
  })

  const header = getNamedRouteRegex(interceptingRoute, {
    prefixRouteKeys: true,
    reference: destination.reference,
  })

  const source = getNamedRouteRegex(basePath + interceptedRoute, {
    prefixRouteKeys: true,
    reference: header.reference,
  })

  const headerRegex = header.namedRegex
    // Strip ^ and $ anchors since matchHas() will add them automatically
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    // Replace matching the `/` with matching any route segment.
    .replace(/^\/\(\?:\/\)\?$/, '/.*')
    // Replace the optional trailing with slash capture group with one that
    // will match any descendants.
    .replace(/\(\?:\/\)\?$/, '(?:/.*)?')

  return {
    source: source.pathToRegexpPattern,
    destination: destination.pathToRegexpPattern,
    has: [
      {
        type: 'header',
        key: NEXT_URL,
        value: headerRegex,
      },
    ],
    regex: source.namedRegex,
  }
}

export function generateInterceptionRoutesRewrites(
  appPaths: string[],
  basePath = '',
  denormalizedAppPaths?: string[]
): Rewrite[] {
  const rewrites: Rewrite[] = []

  for (const appPath of appPaths) {
    if (isInterceptionRouteAppPath(appPath)) {
      const { interceptingRoute, interceptedRoute } =
        extractInterceptionRouteInformation(appPath)

      // When denormalized paths are provided, check if multiple route groups
      // map to this same normalized interception route. If so, generate a
      // separate rewrite for each group with a more specific header regex.
      // This fixes #67034 where two route groups intercepting the same path
      // produced identical rewrites.
      if (denormalizedAppPaths) {
        // Find all denormalized paths that normalize to this appPath
        const variants = denormalizedAppPaths.filter(
          (p) => normalizeAppPath(p) === appPath
        )

        // Group variants by their route group prefix
        const groupPrefixes = new Map<string | null, string[]>()
        for (const variant of variants) {
          const prefix = getRouteGroupPrefix(variant)
          const existing = groupPrefixes.get(prefix)
          if (existing) {
            existing.push(variant)
          } else {
            groupPrefixes.set(prefix, [variant])
          }
        }

        // If there are multiple distinct route groups, generate separate rewrites
        if (groupPrefixes.size > 1) {
          for (const [groupPrefix] of groupPrefixes) {
            if (groupPrefix) {
              const effectiveRoute = findEffectiveInterceptingRoute(
                groupPrefix,
                interceptingRoute,
                denormalizedAppPaths
              )
              rewrites.push(
                generateRewrite(
                  appPath,
                  effectiveRoute,
                  interceptedRoute,
                  basePath
                )
              )
            } else {
              // No route group - use standard intercepting route
              rewrites.push(
                generateRewrite(
                  appPath,
                  interceptingRoute,
                  interceptedRoute,
                  basePath
                )
              )
            }
          }
          continue
        }

        // Single group prefix - check if it provides a more specific route
        const singlePrefix = [...groupPrefixes.keys()][0]
        if (singlePrefix) {
          const effectiveRoute = findEffectiveInterceptingRoute(
            singlePrefix,
            interceptingRoute,
            denormalizedAppPaths
          )
          rewrites.push(
            generateRewrite(appPath, effectiveRoute, interceptedRoute, basePath)
          )
          continue
        }
      }

      // Default: no denormalized paths or no route groups
      rewrites.push(
        generateRewrite(appPath, interceptingRoute, interceptedRoute, basePath)
      )
    }
  }

  // Sort rewrites so that more specific header regexes come first.
  // This ensures that when multiple interception routes match the same
  // source URL, the most specific one (based on the Next-Url header match)
  // takes priority.
  rewrites.sort((a, b) => {
    const aHeader = a.has?.[0]?.value ?? ''
    const bHeader = b.has?.[0]?.value ?? ''
    // Longer regex patterns are typically more specific
    return bHeader.length - aHeader.length
  })

  return rewrites
}
