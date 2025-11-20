import {
  getParamProperties,
  type SegmentParam,
} from '../shared/lib/router/utils/get-segment-param'
import {
  isInterceptionAppRoute,
  parseAppRoute,
  type NormalizedAppRoute,
  type NormalizedAppRouteSegment,
} from '../shared/lib/router/routes/app'

/**
 * Validates segment parameters for common syntax errors.
 * Based on validation logic from sorted-routes.ts
 */
function validateSegmentParam(param: SegmentParam, pathname: string): void {
  // Check for empty parameter names
  if (param.paramName.length === 0) {
    throw new Error(`Parameter names cannot be empty in route "${pathname}".`)
  }

  // Check for three-dot character (…) instead of ...
  if (param.paramName.includes('…')) {
    throw new Error(
      `Detected a three-dot character ('…') in parameter "${param.paramName}" in route "${pathname}". Did you mean ('...')?`
    )
  }

  // Check for optional non-catch-all segments (not yet supported)
  if (
    param.paramType !== 'optional-catchall' &&
    param.paramName.startsWith('[') &&
    param.paramName.endsWith(']')
  ) {
    throw new Error(
      `Optional route parameters are not yet supported ("[${param.paramName}]") in route "${pathname}".`
    )
  }

  // Check for extra brackets
  if (param.paramName.startsWith('[') || param.paramName.endsWith(']')) {
    throw new Error(
      `Segment names may not start or end with extra brackets ('${param.paramName}') in route "${pathname}".`
    )
  }

  // Check for erroneous periods
  if (param.paramName.startsWith('.')) {
    throw new Error(
      `Segment names may not start with erroneous periods ('${param.paramName}') in route "${pathname}".`
    )
  }
}

/**
 * Validates a Route object for internal consistency.
 * Checks for duplicate slugs, invalid catch-all placement, and other route errors.
 * For interception routes, validates both the intercepting and intercepted routes separately.
 * Returns the validated segment parameters.
 */
function validateAppRoute(route: NormalizedAppRoute): void {
  // For interception routes, validate the intercepting and intercepted routes separately
  // This allows the same parameter name to appear in both parts
  if (isInterceptionAppRoute(route)) {
    validateAppRoute(route.interceptingRoute)
    validateAppRoute(route.interceptedRoute)
    return
  }

  // Then validate semantic constraints (duplicates, normalization, positioning)
  const slugNames = new Set<string>()
  const normalizedSegments = new Set<string>()
  let hasCatchAll = false
  let hasOptionalCatchAllInPath = false
  let catchAllPosition = -1

  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i]

    // Type narrowing - only process dynamic segments
    if (segment.type === 'dynamic') {
      // First, validate syntax
      validateSegmentParam(segment.param, route.pathname)

      const properties = getParamProperties(segment.param.paramType)

      if (properties.repeat) {
        if (properties.optional) {
          hasOptionalCatchAllInPath = true
        } else {
          hasCatchAll = true
        }

        catchAllPosition = i
      }

      // Check to see if the parameter name is already in use.
      if (slugNames.has(segment.param.paramName)) {
        throw new Error(
          `You cannot have the same slug name "${segment.param.paramName}" repeat within a single dynamic path in route "${route.pathname}".`
        )
      }

      // Normalize parameter name for comparison by removing all non-word
      // characters.
      const normalizedSegment = segment.param.paramName.replace(/\W/g, '')
      if (normalizedSegments.has(normalizedSegment)) {
        const existing = Array.from(slugNames).find((s) => {
          return s.replace(/\W/g, '') === normalizedSegment
        })
        throw new Error(
          `You cannot have the slug names "${existing}" and "${segment.param.paramName}" differ only by non-word symbols within a single dynamic path in route "${route.pathname}".`
        )
      }

      slugNames.add(segment.param.paramName)
      normalizedSegments.add(normalizedSegment)
    }

    // Check if catch-all is not at the end
    if (hasCatchAll && i > catchAllPosition) {
      throw new Error(
        `Catch-all must be the last part of the URL in route "${route.pathname}".`
      )
    }
    if (hasOptionalCatchAllInPath && i > catchAllPosition) {
      throw new Error(
        `Optional catch-all must be the last part of the URL in route "${route.pathname}".`
      )
    }
  }

  // Check for both required and optional catch-all
  if (hasCatchAll && hasOptionalCatchAllInPath) {
    throw new Error(
      `You cannot use both a required and optional catch-all route at the same level in route "${route.pathname}".`
    )
  }
}

/**
 * Validates a single path for internal consistency and returns its segment parameters.
 */
function parseAndValidateAppPath(path: string): NormalizedAppRoute {
  // Fast parse the route information. We're expecting this to be a normalized
  // route, so we pass `true` to the `parseAppRoute` function.
  const route = parseAppRoute(path, true)

  // Slow walk the data from the route in order to validate it.
  validateAppRoute(route)

  return route
}

/**
 * Normalizes segments by replacing dynamic segment names with placeholders.
 * This allows us to compare routes for structural equivalence.
 * Preserves interception markers so that routes with different markers are not considered ambiguous.
 *
 * Examples:
 * - [slug] -> [*]
 * - [modalSlug] -> [*]
 * - [...slug] -> [...*]
 * - [[...slug]] -> [[...*]]
 * - (..)test -> (..)test
 * - (..)[slug] -> (..)[*]
 */
function normalizeSegments(
  segments: readonly NormalizedAppRouteSegment[]
): string {
  return (
    '/' +
    segments
      .map((segment) => {
        if (segment.type === 'static') {
          return segment.name
        }

        // Dynamic segment - normalize the parameter name by replacing the
        // parameter name with a wildcard. The interception marker is already
        // included in the segment name, so no special handling is needed.
        return segment.name.replace(segment.param.paramName, '*')
      })
      .join('/')
  )
}

/**
 * Validates that app paths don't create ambiguous routes.
 *
 * NOTE: The paths passed to this function should already have been normalized by normalizeAppPath,
 * which means parallel route segments (@modal, @sidebar, etc.) have been removed.
 *
 * This function performs two types of validation:
 * 1. Individual path validation (syntax, slug names, catch-all placement, etc.)
 * 2. Cross-path validation (ambiguous routes, conflicting patterns)
 *
 * @param appPaths - Array of normalized app router paths to validate
 * @returns Array of validated routes
 * @throws Error if validation fails
 */
export function validateAppPaths(
  appPaths: readonly string[]
): NormalizedAppRoute[] {
  // First, validate each path individually
  const paramsByPath = new Map<string, NormalizedAppRoute>()
  for (const path of appPaths) {
    paramsByPath.set(path, parseAndValidateAppPath(path))
  }

  // Group paths by their normalized structure for ambiguity detection
  const structureMap = new Map<string, string[]>()

  for (const [path, route] of paramsByPath) {
    // Check if the last segment is an optional catch-all and check to see if
    // there is a route with the same specificity that conflicts with it.
    const lastSegment = route.segments[route.segments.length - 1]
    if (
      lastSegment?.type === 'dynamic' &&
      lastSegment.param.paramType === 'optional-catchall'
    ) {
      const prefixSegments = route.segments.slice(0, -1)
      const normalizedPrefix = normalizeSegments(prefixSegments)

      for (const [appPath, appRoute] of paramsByPath) {
        const normalizedAppPath = normalizeSegments(appRoute.segments)

        // Special case: root-level optional catch-all
        // /[[...slug]] has prefix '' which should match '/'
        if (prefixSegments.length === 0 && appPath === '/') {
          throw new Error(
            `You cannot define a route with the same specificity as an optional catch-all route ("${appPath}" and "/[[...${lastSegment.param.paramName}]]").`
          )
        }

        // General case: compare normalized structures
        if (normalizedAppPath === normalizedPrefix) {
          throw new Error(
            `You cannot define a route with the same specificity as an optional catch-all route ("${appPath}" and "${normalizedPrefix}/[[...${lastSegment.param.paramName}]]").`
          )
        }
      }
    }

    // Normalize the route to get its structure
    const structure = normalizeSegments(route.segments)

    // Track which paths map to this structure
    const existingPaths = structureMap.get(structure) ?? []
    existingPaths.push(path)
    structureMap.set(structure, existingPaths)
  }

  // Check for ambiguous routes (different slug names, same structure)
  const conflicts: Array<{ paths: string[]; normalizedPath: string }> = []

  for (const [structure, paths] of structureMap) {
    if (paths.length > 1) {
      // Multiple paths map to the same structure - this is ambiguous
      conflicts.push({
        paths,
        normalizedPath: structure,
      })
    }
  }

  if (conflicts.length > 0) {
    const errorMessages = conflicts.map(({ paths, normalizedPath }) => {
      const pathsList = paths.map((p) => `  - ${p}`).join('\n')
      return `Ambiguous route pattern "${normalizedPath}" matches multiple routes:\n${pathsList}`
    })

    throw new Error(
      `Ambiguous app routes detected:\n\n${errorMessages.join('\n\n')}\n\n` +
        `These routes cannot be distinguished from each other when matching URLs. ` +
        `Please ensure that dynamic segments have unique patterns or use different static segments.`
    )
  }

  return Array.from(paramsByPath.values())
}
