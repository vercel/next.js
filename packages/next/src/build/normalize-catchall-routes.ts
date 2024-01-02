import { isInterceptionRouteAppPath } from '../server/future/helpers/interception-routes'
import { AppPathnameNormalizer } from '../server/future/normalizers/built/app/app-pathname-normalizer'

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
        !appPaths[appPath].some((path) => hasMatchedSlots(path, catchAllRoute))
      ) {
        appPaths[appPath].push(catchAllRoute)
      }
    }
  }
}

function hasMatchedSlots(path1: string, path2: string): boolean {
  const slots1 = path1.split('/').filter((segment) => segment.startsWith('@'))
  const slots2 = path2.split('/').filter((segment) => segment.startsWith('@'))

  if (slots1.length !== slots2.length) return false

  for (let i = 0; i < slots1.length; i++) {
    if (slots1[i] !== slots2[i]) return false
  }

  return true
}

const catchAllRouteRegex = /\[?\[\.\.\./

function isCatchAllRoute(pathname: string): boolean {
  return pathname.includes('[...') || pathname.includes('[[...')
}
