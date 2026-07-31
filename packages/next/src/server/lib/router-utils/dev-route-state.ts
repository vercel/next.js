import type { FilesystemDynamicRoute } from './filesystem'
import type { NextConfigComplete } from '../../config-shared'
import type { Route } from '../../../build/swc/types'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { compareAppPaths } from '../../../shared/lib/router/utils/app-paths'
import { buildDataRoute } from './build-data-route'

/**
 * Everything the dev router needs in order to serve a route: which pathnames
 * exist, which of them belong to the App Router, and which regexes to try once
 * an exact pathname lookup misses.
 */
export interface DevRouteState {
  appFiles: Set<string>
  pageFiles: Set<string>
  appPathRoutes: Record<string, string[]>
  dynamicRoutes: FilesystemDynamicRoute[]
}

/**
 * Builds the route list the dev router matches a request against once an exact
 * path lookup missed. The `/_next/data` routes come first so a data request
 * doesn't match the page route it shadows.
 */
export function buildDevDynamicRoutes(
  routedPages: string[],
  i18n: NextConfigComplete['i18n']
): FilesystemDynamicRoute[] {
  const sortedRoutes = getSortedRoutes(routedPages)

  const pageRoutes = sortedRoutes.map((page): FilesystemDynamicRoute => {
    const regex = getNamedRouteRegex(page, {
      prefixRouteKeys: true,
    })
    return {
      regex: regex.re.toString(),
      namedRegex: regex.namedRegex,
      routeKeys: regex.routeKeys,
      match: getRouteMatcher(regex),
      page,
    }
  })

  const dataRoutes = sortedRoutes.map((page): FilesystemDynamicRoute => {
    const route = buildDataRoute(page, 'development')
    const routeRegex = getNamedRouteRegex(route.page, {
      prefixRouteKeys: true,
    })
    return {
      ...route,
      regex: routeRegex.re.toString(),
      namedRegex: routeRegex.namedRegex,
      routeKeys: routeRegex.routeKeys,
      match: getRouteMatcher({
        // TODO: fix this in the manifest itself, must also be fixed in
        // upstream builder that relies on this
        re: i18n
          ? new RegExp(
              route.dataRouteRegex.replace(
                `/development/`,
                `/development/(?<nextLocale>[^/]+?)/`
              )
            )
          : new RegExp(route.dataRouteRegex),
        groups: routeRegex.groups,
      }),
    }
  })

  return [...dataRoutes, ...pageRoutes]
}

/**
 * Derives the dev route state from the routes Turbopack has compiled. The
 * pathnames Turbopack reports are already normalized the way the router wants
 * them: route groups are stripped, private folders are left out, and escaped
 * underscores are decoded. The only entry that isn't a real URL is the
 * `/_not-found` route the App Router synthesizes for us.
 */
export function deriveDevRouteState(
  routes: ReadonlyMap<string, Route>,
  {
    useFileSystemPublicRoutes,
    i18n,
  }: {
    useFileSystemPublicRoutes: boolean
    i18n: NextConfigComplete['i18n']
  }
): DevRouteState {
  const appFiles = new Set<string>()
  const pageFiles = new Set<string>()
  const appPathRoutes: Record<string, string[]> = {}
  const routedPages: string[] = []

  for (const [pathname, route] of routes) {
    let originalNames: string[]

    switch (route.type) {
      case 'page':
      case 'page-api':
        if (useFileSystemPublicRoutes) {
          pageFiles.add(pathname)
        }
        routedPages.push(pathname)
        continue
      case 'app-page':
        originalNames = route.pages.map((page) => page.originalName)
        break
      case 'app-route':
        originalNames = [route.originalName]
        break
      case 'conflict':
        continue
      default:
        route satisfies never
        continue
    }

    if (pathname === '/_not-found') {
      continue
    }

    if (useFileSystemPublicRoutes) {
      appFiles.add(pathname)
    }
    // Make sure to sort parallel routes to make the result deterministic.
    appPathRoutes[pathname] = originalNames.sort(compareAppPaths)
    routedPages.push(pathname)
  }

  return {
    appFiles,
    pageFiles,
    appPathRoutes,
    dynamicRoutes: buildDevDynamicRoutes(routedPages, i18n),
  }
}
