import { isInterceptionRouteAppPath } from '../server/lib/interception-routes'
import { AppPathnameNormalizer } from '../server/normalizers/built/app/app-pathname-normalizer'

/**
 * This function will transform the appPaths in order to support catch-all routes and parallel routes.
 * It will traverse the appPaths, looking for catch-all routes and try to find parallel routes that could match
 * the catch-all. If it finds a match, it will add the catch-all to the parallel route's list of possible routes.
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
