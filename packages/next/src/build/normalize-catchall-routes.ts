import { isInterceptionRouteAppPath } from '../shared/lib/router/utils/interception-routes'
import { AppPathnameNormalizer } from '../server/normalizers/built/app/app-pathname-normalizer'

/**
 * This function will transform the appPaths in order to support catch-all routes and parallel routes.
 * It will traverse the appPaths, looking for catch-all routes and try to find parallel routes that could match
 * the catch-all. If it finds a match, it will add the catch-all to the parallel route's list of possible routes.
 *
 * It also handles single dynamic segment routes (`[param]`) in parallel slots. When a static path like
 * `/test/static` exists and a parallel slot has a dynamic route like `/@parallel/test/[param]` but no
 * `/@parallel/test/static`, the dynamic route is added as a fallback for that slot.
 *
 * @param appPaths The appPaths to transform
 */
export function normalizeCatchAllRoutes(
  appPaths: Record<string, string[]>,
  normalizer = new AppPathnameNormalizer()
) {
  const catchAllRoutes = [
    ...new Set(
      Object.values(appPaths)
        .flat()
        .filter(isCatchAllRoute)
        // Sorting is important because we want to match the most specific path.
        .sort((a, b) => b.split('/').length - a.split('/').length)
    ),
  ]

  // interception routes should only be matched by a single entrypoint
  // we don't want to push a catch-all route to an interception route
  // because it would mean the interception would be handled by the wrong page component
  const filteredAppPaths = Object.keys(appPaths).filter(
    (route) => !isInterceptionRouteAppPath(route)
  )

  for (const appPath of filteredAppPaths) {
    for (const catchAllRoute of catchAllRoutes) {
      const normalizedCatchAllRoute = normalizer.normalize(catchAllRoute)
      const normalizedCatchAllRouteBasePath = normalizedCatchAllRoute.slice(
        0,
        normalizedCatchAllRoute.search(catchAllRouteRegex)
      )

      if (
        // check if the appPath could match the catch-all
        appPath.startsWith(normalizedCatchAllRouteBasePath) &&
        // check if there's not already a slot value that could match the catch-all
        !appPaths[appPath].some((path) => hasMatchedSlots(path, catchAllRoute))
      ) {
        // optional catch-all routes are not currently supported, but leaving this logic in place
        // for when they are eventually supported.
        if (isOptionalCatchAll(catchAllRoute)) {
          // optional catch-all routes should match both the root segment and any segment after it
          // for example, `/[[...slug]]` should match `/` and `/foo` and `/foo/bar`
          appPaths[appPath].push(catchAllRoute)
        } else if (isCatchAll(catchAllRoute)) {
          // regular catch-all (single bracket) should only match segments after it
          // for example, `/[...slug]` should match `/foo` and `/foo/bar` but not `/`
          if (normalizedCatchAllRouteBasePath !== appPath) {
            appPaths[appPath].push(catchAllRoute)
          }
        }
      }
    }
  }

  // Propagate single dynamic segment routes from parallel slots.
  // When a static path like `/test/static` exists and a parallel slot has
  // `/@parallel/test/[param]` but no `/@parallel/test/static`, add the
  // dynamic route as a fallback for that slot.
  normalizeDynamicRoutes(appPaths, filteredAppPaths, normalizer)
}

/**
 * Propagates single dynamic segment parallel routes to static paths that
 * could be matched by them.
 *
 * For example, if `@parallel/test/[testParam]/page` exists but there is no
 * `@parallel/test/static/page`, and `/test/static` is a valid app path,
 * then `@parallel/test/[testParam]/page` will be added to the `/test/static`
 * entry so that the parallel slot resolves to the dynamic page instead of
 * falling back to `default.tsx`.
 */
function normalizeDynamicRoutes(
  appPaths: Record<string, string[]>,
  filteredAppPaths: string[],
  normalizer: AppPathnameNormalizer
): void {
  // Collect all dynamic routes that belong to a parallel slot (contain @).
  const dynamicParallelRoutes = [
    ...new Set(
      Object.values(appPaths)
        .flat()
        .filter(
          (route) =>
            route.includes('@') &&
            hasDynamicSegment(route) &&
            !isCatchAllRoute(route) &&
            !isInterceptionRouteAppPath(route)
        )
        // Prefer more specific (deeper) routes first.
        .sort((a, b) => b.split('/').length - a.split('/').length)
    ),
  ]

  if (dynamicParallelRoutes.length === 0) return

  for (const appPath of filteredAppPaths) {
    // Skip default route entries, which are fallback routes and should not
    // receive dynamic route propagation.
    if (appPath.endsWith('/default')) continue

    for (const dynamicRoute of dynamicParallelRoutes) {
      const normalizedDynamic = normalizer.normalize(dynamicRoute)

      // Check if this dynamic route could match the appPath.
      // A dynamic route like `/test/[param]` can match `/test/static` if:
      // 1. They have the same number of segments.
      // 2. All non-dynamic segments in the dynamic route match the appPath.
      // 3. Dynamic segments in the dynamic route only match static (non-dynamic)
      //    segments in the appPath.
      if (
        dynamicRouteMatchesPath(normalizedDynamic, appPath) &&
        // Don't add if the slot already has a matching entry for this path.
        !appPaths[appPath].some((path) => hasMatchedSlots(path, dynamicRoute))
      ) {
        appPaths[appPath].push(dynamicRoute)
      }
    }
  }
}

/**
 * Checks if a normalized dynamic route pattern could match a given path.
 * For example, `/test/[param]` matches `/test/static` because they have the same
 * number of segments and the non-dynamic segments match.
 *
 * Dynamic segments in the dynamic route must correspond to static (non-dynamic)
 * segments in the target path. This prevents matching patterns like
 * `/nested/[foo]/[bar]/[baz]` against `/nested/[foo]/[bar]/[qux]` where both
 * sides have dynamic segments at the same position.
 */
function dynamicRouteMatchesPath(
  dynamicRoute: string,
  targetPath: string
): boolean {
  const dynamicSegments = dynamicRoute.split('/').filter(Boolean)
  const targetSegments = targetPath.split('/').filter(Boolean)

  if (dynamicSegments.length !== targetSegments.length) return false

  // At least one position must have a dynamic-to-static match
  let hasDynamicToStaticMatch = false

  for (let i = 0; i < dynamicSegments.length; i++) {
    if (isDynamicSegment(dynamicSegments[i])) {
      // Only count as a match if the corresponding target segment is static.
      // If the target also has a dynamic segment at this position, skip it
      // (both sides are dynamic, so this isn't a meaningful match).
      if (!isDynamicSegment(targetSegments[i])) {
        hasDynamicToStaticMatch = true
      }
      continue
    }
    if (dynamicSegments[i] !== targetSegments[i]) return false
  }

  return hasDynamicToStaticMatch
}

function hasMatchedSlots(path1: string, path2: string): boolean {
  const slots1 = path1.split('/').filter(isMatchableSlot)
  const slots2 = path2.split('/').filter(isMatchableSlot)

  // if the catch-all route does not have the same number of slots as the app path, it can't match
  if (slots1.length !== slots2.length) return false

  // compare the slots in both paths. For there to be a match, each slot must be the same
  for (let i = 0; i < slots1.length; i++) {
    if (slots1[i] !== slots2[i]) return false
  }

  return true
}

/**
 * Returns true for slots that should be considered when checking for match compatibility.
 * Excludes children slots because these are similar to having a segment-level `page`
 * which would cause a slot length mismatch when comparing it to a catch-all route.
 */
function isMatchableSlot(segment: string): boolean {
  return segment.startsWith('@') && segment !== '@children'
}

const catchAllRouteRegex = /\[?\[\.\.\./

function isCatchAllRoute(pathname: string): boolean {
  // Optional catch-all slots are not currently supported, and as such they are not considered when checking for match compatability.
  return !isOptionalCatchAll(pathname) && isCatchAll(pathname)
}

function isOptionalCatchAll(pathname: string): boolean {
  return pathname.includes('[[...')
}

function isCatchAll(pathname: string): boolean {
  return pathname.includes('[...')
}

function isDynamicSegment(segment: string): boolean {
  return (
    segment.startsWith('[') && segment.endsWith(']') && !segment.includes('...')
  )
}

function hasDynamicSegment(pathname: string): boolean {
  return pathname.split('/').some(isDynamicSegment)
}
