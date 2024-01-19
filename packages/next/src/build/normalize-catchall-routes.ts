import { isInterceptionRouteAppPath } from '../server/future/helpers/interception-routes'
import { AppPathnameNormalizer } from '../server/future/normalizers/built/app/app-pathname-normalizer'
import { isDynamicRoute } from '../shared/lib/router/utils'

/**
 * This function will transform the appPaths in order to support catch-all routes and parallel routes.
 * It will traverse the appPaths, looking for catch-all routes and try to find parallel routes that could match
 * the catch-all. If it finds a match, it will add the catch-all to the parallel route's list of possible routes.
 *
 * @param appPaths  The appPaths to transform
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
        !appPaths[appPath].some((path) =>
          hasMatchedSlots(path, catchAllRoute)
        ) &&
        // check if the catch-all is not already matched by a default route or page route
        !appPaths[`${appPath}/default`] &&
        // check if appPath does not ends with a dynamic segment that is not a catch-all (with endsWithDynamicNonCatchAll) AND is more specific than the catch-all
        !(
          endsWithDynamicNonCatchAll(appPath) &&
          isMoreSpecific(appPath, catchAllRoute)
        )
      ) {
        appPaths[appPath].push(catchAllRoute)
      }
    }
  }
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
 * Returns true for slots that should be considered when checking for match compatability.
 * Excludes children slots because these are similar to having a segment-level `page`
 * which would cause a slot length mismatch when comparing it to a catch-all route.
 */
function isMatchableSlot(segment: string): boolean {
  return segment.startsWith('@') && segment !== '@children'
}

const catchAllRouteRegex = /\[?\[\.\.\./

function isCatchAllRoute(pathname: string): boolean {
  return pathname.includes('[...') || pathname.includes('[[...')
}

// test to see if a path ends with a dynamic segment that is not a catch-all
function endsWithDynamicNonCatchAll(pathname: string): boolean {
  const pathnameParts = pathname.split('/')
  const endPath = `/${pathnameParts[pathnameParts.length - 1]}`

  return isDynamicRoute(endPath) && !isCatchAllRoute(endPath)
}

// test to see if a path is more specific than a catch-all route
function isMoreSpecific(pathname: string, catchAllRoute: string): boolean {
  const pathnameDepth = pathname.split('/').length
  const catchAllRouteDepth = catchAllRoute.split('/').length - 1
  return pathnameDepth >= catchAllRouteDepth
}
