import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { isAppPageRoute } from '../../../lib/is-app-page-route'
import {
  INTERCEPTION_ROUTE_MARKERS,
  isInterceptionRouteAppPath,
} from '../../../shared/lib/router/utils/interception-routes'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../../../shared/lib/entry-constants'

type AppPathNormalizer = {
  normalize(pathname: string): string
}

export type NormalizeCatchAllRoutesOptions = {
  strictRouteMatching?: boolean
  defaultAppPaths?: Iterable<string>
}

type ParallelRouteLevel = {
  parentSegments: string[]
  namedSlots: Set<string>
  hasChildrenSlot: boolean
}

const defaultNormalizer: AppPathNormalizer = {
  normalize(pathname: string): string {
    return normalizeAppPath(pathname).replace(/%5F/g, '_')
  },
}

/**
 * This function will transform the appPaths in order to support catch-all routes and parallel routes.
 * It will traverse the appPaths, looking for catch-all routes and try to find parallel routes that could match
 * the catch-all. If it finds a match, it will add the catch-all to the parallel route's list of possible routes.
 *
 * @param appPaths The appPaths to transform
 */
export function normalizeCatchAllRoutes(
  appPaths: Record<string, string[]>,
  normalizer: AppPathNormalizer = defaultNormalizer,
  {
    strictRouteMatching = false,
    defaultAppPaths = [],
  }: NormalizeCatchAllRoutesOptions = {}
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

  if (strictRouteMatching) {
    pruneUnrenderableRoutes(appPaths, defaultAppPaths)
  }
}

/**
 * Removes routes that can never render because a declared slot at a matching
 * layout level has neither a matching page nor an explicit default.
 *
 * The built-in default for such a slot always calls `notFound()`. Keeping the
 * route in the matcher set would therefore retain a matcher that can never
 * construct a complete loader tree.
 */
function pruneUnrenderableRoutes(
  appPaths: Record<string, string[]>,
  defaultAppPaths: Iterable<string>
) {
  const allAppPaths = new Set([
    ...Object.values(appPaths).flat().filter(isUserAppPageRoute),
    ...[...defaultAppPaths].filter(
      (appPath) => !isBuiltinAppPageEntry(appPath)
    ),
  ])
  const levelsByParent = new Map<string, ParallelRouteLevel>()

  for (const appPath of allAppPaths) {
    const segments = splitAppPath(appPath)

    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (!isMatchableSlot(segment)) continue

      const parentSegments = segments.slice(0, i)
      const parentKey = JSON.stringify(parentSegments)
      let level = levelsByParent.get(parentKey)
      if (!level) {
        level = {
          parentSegments,
          namedSlots: new Set(),
          hasChildrenSlot: false,
        }
        levelsByParent.set(parentKey, level)
      }
      level.namedSlots.add(segment)
    }
  }

  for (const appPath of allAppPaths) {
    for (const level of levelsByParent.values()) {
      if (isPathInSlot(appPath, level.parentSegments, 'children')) {
        level.hasChildrenSlot = true
      }
    }
  }

  for (const [route, matchedAppPaths] of Object.entries(appPaths)) {
    const matchedPageAppPaths = matchedAppPaths.filter(isUserAppPageRoute)
    if (matchedPageAppPaths.length === 0) continue

    if (
      hasIncompleteParallelRoute(
        matchedPageAppPaths,
        levelsByParent.values(),
        allAppPaths
      )
    ) {
      const nonPageAppPaths = matchedAppPaths.filter(
        (appPath) => !isUserAppPageRoute(appPath)
      )
      if (nonPageAppPaths.length === 0) {
        delete appPaths[route]
      } else {
        appPaths[route] = nonPageAppPaths
      }
    }
  }
}

function isUserAppPageRoute(appPath: string): boolean {
  return isAppPageRoute(appPath) && !isBuiltinAppPageEntry(appPath)
}

function isBuiltinAppPageEntry(appPath: string): boolean {
  return (
    appPath === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY ||
    appPath === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY
  )
}

function hasIncompleteParallelRoute(
  matchedAppPaths: string[],
  levels: Iterable<ParallelRouteLevel>,
  allAppPaths: Set<string>
): boolean {
  const matchedSegments = matchedAppPaths.map((appPath) =>
    splitAppPath(appPath).slice(0, -1)
  )

  for (const { parentSegments, namedSlots, hasChildrenSlot } of levels) {
    const pathsAtLevel = matchedSegments.filter((segments) =>
      hasPathPrefix(segments, parentSegments)
    )
    if (pathsAtLevel.length === 0) continue

    // An interception response replaces one slot while retaining every
    // sibling owned by layouts up to the interception marker. Those siblings
    // use the null retain marker rather than a page or default. Slots inside
    // the newly selected subtree still match normally.
    const retainsInterceptionSiblings = pathsAtLevel.some((segments) => {
      const interceptionMarkerIndex = segments.findIndex((segment) =>
        INTERCEPTION_ROUTE_MARKERS.some((marker) => segment.startsWith(marker))
      )
      return (
        interceptionMarkerIndex !== -1 &&
        parentSegments.length <= interceptionMarkerIndex
      )
    })

    const slots = [...(hasChildrenSlot ? ['children'] : []), ...namedSlots]
    for (const slot of slots) {
      const hasMatchedPage = matchedAppPaths.some((appPath) =>
        isPathInSlot(appPath, parentSegments, slot)
      )
      const hasDefault = allAppPaths.has(
        getDefaultAppPath(parentSegments, slot)
      )

      if (!hasMatchedPage && !hasDefault && !retainsInterceptionSiblings) {
        return true
      }
    }
  }

  return false
}

function splitAppPath(appPath: string): string[] {
  return appPath.split('/').filter(Boolean)
}

function hasPathPrefix(path: string[], prefix: string[]): boolean {
  return prefix.every((segment, index) => path[index] === segment)
}

function getSlotAtParent(path: string[], parent: string[]): string {
  const segment = path[parent.length]
  return segment?.startsWith('@') && segment !== '@children'
    ? segment
    : 'children'
}

function isPathInSlot(
  appPath: string,
  parent: string[],
  slot: string
): boolean {
  const segments = splitAppPath(appPath)
  return (
    hasPathPrefix(segments, parent) &&
    getSlotAtParent(segments, parent) === slot
  )
}

function getDefaultAppPath(parent: string[], slot: string): string {
  const segments =
    slot === 'children' ? [...parent, 'default'] : [...parent, slot, 'default']
  return `/${segments.join('/')}`
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
