import type { FilesystemDynamicRoute } from './filesystem'
import type { NextConfigComplete } from '../../config-shared'
import type { Route, RouteInfo } from '../../../build/swc/types'
import type { RouteDefinition } from '../../route-definitions/route-definition'
import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import type { PagesRouteDefinition } from '../../route-definitions/pages-route-definition'
import type { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'
import { RouteKind } from '../../route-kind'
import { getSortedRoutes } from '../../../shared/lib/router/utils'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import { compareAppPaths } from '../../../shared/lib/router/utils/app-paths'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import {
  isMetadataRoute,
  isStaticMetadataRoute,
} from '../../../lib/metadata/is-metadata-route'
import { posix, join } from 'path'
import { buildDataRoute } from './build-data-route'

/**
 * The part of a Turbopack route that the dev route state is derived from,
 * shared between the entrypoints subscription (which carries full routes with
 * endpoints) and the on-demand route list (which doesn't).
 */
export interface DevRouteInfo {
  type: Route['type']
  /**
   * The original names of the app pages behind the route (there are multiple
   * for parallel routes), or the original name of an app route. Empty for
   * pages routes.
   */
  originalNames: string[]
}

/**
 * The multi (id-suffixed) variant of a dynamic metadata route, derived from
 * the Turbopack entry name of the single variant, e.g. for
 * `/gsp/sitemap.xml/route`: the pathname `/gsp/sitemap/[__metadata_id__]`,
 * the page `/gsp/sitemap/[__metadata_id__]/route`, and the extensionless
 * source pathname `/gsp/sitemap`.
 */
function dynamicMetadataMultiRoute(originalName: string): {
  multiPathname: string
  multiPage: string
  sourcePathname: string
} {
  const base = originalName.endsWith('/route')
    ? originalName.slice(0, -'/route'.length)
    : originalName
  const sourcePathname = base.endsWith('/sitemap.xml')
    ? base.slice(0, -'.xml'.length)
    : base
  const multiPathname = `${sourcePathname}/[__metadata_id__]`
  return {
    multiPathname,
    multiPage: `${multiPathname}/route`,
    sourcePathname,
  }
}

export function toDevRouteInfoMap(
  routes: ReadonlyMap<string, Route>
): Map<string, DevRouteInfo> {
  const infos = new Map<string, DevRouteInfo>()
  for (const [pathname, route] of routes) {
    let originalNames: string[]
    switch (route.type) {
      case 'app-page':
        originalNames = route.pages.map((page) => page.originalName)
        break
      case 'app-route':
        originalNames = [route.originalName]
        break
      default:
        originalNames = []
    }
    infos.set(pathname, { type: route.type, originalNames })
  }
  return infos
}

export function routeInfoListToDevRouteInfoMap(
  routes: RouteInfo[]
): Map<string, DevRouteInfo> {
  const infos = new Map<string, DevRouteInfo>()
  for (const route of routes) {
    infos.set(route.pathname, {
      type: route.routeType as Route['type'],
      originalNames: route.originalNames,
    })
  }
  return infos
}

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
  routes: ReadonlyMap<string, DevRouteInfo>,
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
    switch (route.type) {
      case 'page':
      case 'page-api':
        if (useFileSystemPublicRoutes) {
          pageFiles.add(pathname)
        }
        routedPages.push(pathname)
        continue
      case 'app-page':
      case 'app-route':
        break
      case 'conflict':
        continue
      default:
        route.type satisfies never
        continue
    }

    if (pathname === '/_not-found') {
      continue
    }

    if (useFileSystemPublicRoutes) {
      appFiles.add(pathname)
    }
    // Make sure to sort parallel routes to make the result deterministic.
    appPathRoutes[pathname] = [...route.originalNames].sort(compareAppPaths)
    routedPages.push(pathname)

    // Dynamic metadata routes are also served under an id; see
    // `deriveDevRouteDefinitions`.
    if (route.type === 'app-route') {
      const originalName = route.originalNames[0]
      if (
        originalName !== undefined &&
        isMetadataRoute(originalName) &&
        !isStaticMetadataRoute(originalName)
      ) {
        const { multiPathname, multiPage } =
          dynamicMetadataMultiRoute(originalName)
        appPathRoutes[multiPathname] = [multiPage]
        routedPages.push(multiPathname)
      }
    }
  }

  return {
    appFiles,
    pageFiles,
    appPathRoutes,
    dynamicRoutes: buildDevDynamicRoutes(routedPages, i18n),
  }
}

/**
 * Derives the route definitions the dev route matchers serve from. These are
 * the same definitions the filesystem-scanning dev matcher providers would
 * produce, except that the filename is a reconstruction: Turbopack doesn't
 * report source paths, and nothing routes on the filename. Pages routes are
 * keyed by pathname and app routes by original name, matching how
 * `ensurePage` looks routes up in the entrypoints.
 */
export function deriveDevRouteDefinitions(
  routes: ReadonlyMap<string, DevRouteInfo>,
  {
    appDir,
    pagesDir,
  }: {
    appDir: string | undefined
    pagesDir: string | undefined
  }
): RouteDefinition[] {
  const definitions: RouteDefinition[] = []

  for (const [pathname, route] of routes) {
    switch (route.type) {
      case 'page':
      case 'page-api': {
        if (!pagesDir) continue
        const shared = {
          pathname,
          page: pathname,
          bundlePath: posix.join('pages', normalizePagePath(pathname)),
          filename: join(pagesDir, pathname),
          // Matches all locales; the matcher parses the locale from the
          // request when the application is configured for i18n.
          i18n: {},
        }
        definitions.push(
          route.type === 'page'
            ? ({
                kind: RouteKind.PAGES,
                ...shared,
              } satisfies PagesRouteDefinition)
            : ({
                kind: RouteKind.PAGES_API,
                ...shared,
              } satisfies PagesAPIRouteDefinition)
        )
        continue
      }
      case 'app-page': {
        if (!appDir || pathname === '/_not-found') continue
        const appPaths = [...route.originalNames].sort(compareAppPaths)
        for (const originalName of appPaths) {
          const definition: AppPageRouteDefinition = {
            kind: RouteKind.APP_PAGE,
            pathname,
            page: originalName,
            bundlePath: posix.join('app', originalName),
            filename: join(appDir, originalName),
            appPaths,
          }
          definitions.push(definition)
        }
        continue
      }
      case 'app-route': {
        if (!appDir || pathname === '/_not-found') continue
        const originalName = route.originalNames[0]
        if (originalName === undefined) continue
        definitions.push({
          kind: RouteKind.APP_ROUTE,
          pathname,
          page: originalName,
          bundlePath: posix.join('app', originalName),
          filename: join(appDir, originalName),
        } satisfies AppRouteRouteDefinition)

        // Dynamic metadata routes are also served under an id (e.g. a
        // sitemap.ts with generateSitemaps serves /sitemap/[__metadata_id__]),
        // but Turbopack only reports the single route. Add the multi variant
        // here, the same way the filesystem-scanning matcher provider does.
        if (
          isMetadataRoute(originalName) &&
          !isStaticMetadataRoute(originalName)
        ) {
          const { multiPathname, multiPage, sourcePathname } =
            dynamicMetadataMultiRoute(originalName)
          definitions.push({
            kind: RouteKind.APP_ROUTE,
            pathname: multiPathname,
            page: multiPage,
            bundlePath: posix.join('app', multiPage),
            // The source-like extension makes `ensurePage` map the page back
            // to the Turbopack entry key; see
            // `normalizedPageToTurbopackStructureRoute`.
            filename: join(appDir, `${sourcePathname}.ts`),
          } satisfies AppRouteRouteDefinition)
        }
        continue
      }
      case 'conflict':
        continue
      default:
        route.type satisfies never
    }
  }

  return definitions
}
