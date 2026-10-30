import type { RawEntrypoints } from '../../../build/swc/types'
import type { NextConfigComplete } from '../../config-shared'
import type { AppPageRouteIdentity } from '../../route-definitions/app-page-route-definition'
import type { AppRouteRouteIdentity } from '../../route-definitions/app-route-route-definition'
import type { LocaleRouteIdentity } from '../../route-definitions/locale-route-definition'
import type { RouteIdentity } from '../../route-definitions/route-definition'
import type { DevRoutesSnapshot, FilesystemDynamicRoute } from './filesystem'

import path from 'path'
import { BLOCKED_PAGES } from '../../../shared/lib/constants'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import { getSortedRoutes } from '../../../shared/lib/router/utils/sorted-routes'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { getRouteMatcher } from '../../../shared/lib/router/utils/route-matcher'
import {
  compareAppPaths,
  selectAppPageEntry,
} from '../../../shared/lib/router/utils/app-paths'
import { fillStaticMetadataSegment } from '../../../lib/metadata/get-metadata-route'
import { RouteKind } from '../../route-kind'
import {
  addLocalePrefixToDataRouteRegex,
  buildDataRoute,
} from './build-data-route'

export interface TurbopackDevRouteSnapshot {
  routes: DevRoutesSnapshot
  appPathRoutes: Record<string, string[]>
  sortedRoutes: string[]
  presence: ReadonlySet<string>
  identitiesByPage: ReadonlyMap<string, RouteIdentity>
  identitiesByPathname: ReadonlyMap<string, RouteIdentity>
  appIdentitiesByPage: ReadonlyMap<string, RouteIdentity>
  pageIdentitiesByPage: ReadonlyMap<string, RouteIdentity>
  /** Maps the renderer's app page key to Turbopack's compiler key. */
  appRouteKeys: ReadonlyMap<string, string>
}

/**
 * Builds request-routing state exclusively from Turbopack's effective routes.
 * Authored files remain a separate inventory for types and editor tooling.
 */
export function createTurbopackDevRouteSnapshot(
  entrypoints: RawEntrypoints,
  config: Pick<
    NextConfigComplete,
    'i18n' | 'useFileSystemPublicRoutes' | 'output'
  >
): TurbopackDevRouteSnapshot {
  const appRoutes: Array<AppPageRouteIdentity | AppRouteRouteIdentity> = []
  const pageRoutes: LocaleRouteIdentity[] = []
  const appFiles = new Set<string>()
  const pageFiles = new Set<string>()
  const staticMetadataFiles = new Map<string, string>()
  const nextDataRoutes = new Set<string>()
  const appPathRoutes: Record<string, string[]> = {}
  const presence = new Set<string>()
  const appIdentitiesByPage = new Map<string, RouteIdentity>()
  const pageIdentitiesByPage = new Map<string, RouteIdentity>()
  const identitiesByPathname = new Map<string, RouteIdentity>()
  const appRouteKeys = new Map<string, string>()
  const appAliases = new Map<string, RouteIdentity>()
  const publicRoutes = config.useFileSystemPublicRoutes !== false
  const routedPages = new Set<string>()

  for (const [pathname, route] of entrypoints.routes) {
    switch (route.type) {
      case 'conflict':
        break
      case 'page':
      case 'page-api': {
        if (route.type === 'page-api' && config.output === 'export') break
        if (BLOCKED_PAGES.includes(pathname)) break
        const definition: LocaleRouteIdentity = {
          kind: route.type === 'page' ? RouteKind.PAGES : RouteKind.PAGES_API,
          pathname,
          page: pathname,
          bundlePath: path.posix.join('pages', normalizePagePath(pathname)),
          ...(config.i18n ? { i18n: {} } : undefined),
        }
        pageRoutes.push(definition)
        pageIdentitiesByPage.set(pathname, definition)
        identitiesByPathname.set(pathname, definition)
        presence.add(pathname)
        if (!pathname.endsWith('/_middleware')) routedPages.add(pathname)
        if (publicRoutes) {
          pageFiles.add(pathname)
          nextDataRoutes.add(pathname)
        }
        break
      }
      case 'app-page': {
        // Internal pages have endpoints but no authored loader-tree pages.
        const appPaths = [
          ...new Set(
            route.isInternal
              ? route.pages.map((page) => page.originalName)
              : route.appPaths
          ),
        ].sort(compareAppPaths)
        const page = selectAppPageEntry(pathname, appPaths)
        const definition: AppPageRouteIdentity = {
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath: path.posix.join('app', normalizePagePath(page)),
          appPaths,
        }
        appIdentitiesByPage.set(page, definition)
        identitiesByPathname.set(pathname, definition)
        appRouteKeys.set(page, page)
        appAliases.set(pathname, definition)
        for (const endpoint of route.pages) {
          if (!appAliases.has(endpoint.originalName)) {
            appAliases.set(endpoint.originalName, definition)
          }
        }
        if (route.isInternal) break

        appRoutes.push(definition)
        appPathRoutes[pathname] = appPaths
        presence.add(pathname)
        routedPages.add(pathname)
        if (publicRoutes) appFiles.add(pathname)
        break
      }
      case 'app-route': {
        const definition: AppRouteRouteIdentity = {
          kind: RouteKind.APP_ROUTE,
          pathname: route.runtimePathname,
          page: route.runtimePage,
          bundlePath: path.posix.join(
            'app',
            normalizePagePath(route.runtimePage)
          ),
        }
        appRoutes.push(definition)
        appPathRoutes[definition.pathname] = [definition.page]
        appIdentitiesByPage.set(definition.page, definition)
        identitiesByPathname.set(definition.pathname, definition)
        appRouteKeys.set(definition.page, route.originalName)
        appAliases.set(definition.pathname, definition)
        appAliases.set(route.originalName, definition)
        routedPages.add(definition.pathname)
        if (publicRoutes) {
          if (route.staticMetadataSource) {
            const staticPathname = fillStaticMetadataSegment(
              path.posix.dirname(definition.pathname),
              path.posix.basename(definition.pathname)
            )
            staticMetadataFiles.set(staticPathname, route.staticMetadataSource)
          } else {
            appFiles.add(definition.pathname)
          }
        }
        break
      }
    }
  }

  // Compilation may use built-in fallback endpoints. Presence queries must
  // report authored specials only, rather than these always-present defaults.
  for (const page of BLOCKED_PAGES) {
    pageIdentitiesByPage.set(page, {
      kind: RouteKind.PAGES,
      pathname: page,
      page,
      bundlePath: path.posix.join('pages', page),
    })
    identitiesByPathname.set(page, pageIdentitiesByPage.get(page)!)
  }
  for (const page of entrypoints.development?.authoredPagesSpecialRoutes ??
    []) {
    presence.add(page)
  }
  if (entrypoints.middleware && config.output !== 'export') {
    // Internal callers use the historical middleware name even when the
    // authored convention is proxy. Native discovery already chose the file.
    presence.add('/middleware')
    presence.add('/src/middleware')
    presence.add('/proxy')
    presence.add('/src/proxy')
  }

  // Structural keys win over pathname aliases. The separate maps preserve
  // an explicit isApp hint when a Pages URL resembles an App structural key.
  for (const [alias, definition] of appAliases) {
    if (!appIdentitiesByPage.has(alias)) {
      appIdentitiesByPage.set(alias, definition)
    }
  }
  const identitiesByPage = new Map(pageIdentitiesByPage)
  for (const [page, definition] of appIdentitiesByPage) {
    identitiesByPage.set(page, definition)
  }

  const sortedRoutes = getSortedRoutes([...routedPages])
  const dynamicRoutes = sortedRoutes.map((page): FilesystemDynamicRoute => {
    const regex = getNamedRouteRegex(page, {
      prefixRouteKeys: true,
      includePrefix: true,
      includeSuffix: true,
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
    const regex = getNamedRouteRegex(route.page, { prefixRouteKeys: true })
    return {
      ...route,
      regex: regex.re.toString(),
      namedRegex: regex.namedRegex,
      routeKeys: regex.routeKeys,
      match: getRouteMatcher({
        re: new RegExp(
          config.i18n
            ? addLocalePrefixToDataRouteRegex(
                route.dataRouteRegex,
                'development'
              )
            : route.dataRouteRegex
        ),
        groups: regex.groups,
      }),
    }
  })

  return {
    routes: {
      appRoutes,
      pageRoutes,
      appFiles,
      pageFiles,
      staticMetadataFiles,
      nextDataRoutes,
      dynamicRoutes: [...dataRoutes, ...dynamicRoutes],
    },
    appPathRoutes,
    sortedRoutes,
    presence,
    identitiesByPage,
    identitiesByPathname,
    appIdentitiesByPage,
    pageIdentitiesByPage,
    appRouteKeys,
  }
}

export function lookupTurbopackRoute(
  snapshot: TurbopackDevRouteSnapshot,
  page: string,
  isApp?: boolean
): RouteIdentity | undefined {
  if (isApp === undefined) {
    // User-facing compilation requests identify a public URL. A structural
    // page key is still accepted when no URL in the inventory has that name.
    return (
      snapshot.identitiesByPathname.get(page) ??
      snapshot.identitiesByPage.get(page)
    )
  }
  if (!isApp) return snapshot.pageIdentitiesByPage.get(page)

  const appRoute = snapshot.appIdentitiesByPage.get(page)
  if (appRoute) return appRoute
  // App pages can request Pages API routes with an isApp hint. The hint must
  // still reject ordinary Pages pages, as the compiler's ensurePage does.
  const pagesRoute = snapshot.pageIdentitiesByPage.get(page)
  return pagesRoute?.kind === RouteKind.PAGES_API ? pagesRoute : undefined
}

/** Resolves a stale route hint by its URL pattern, never by a structural key. */
export function lookupTurbopackRouteByPathname(
  snapshot: TurbopackDevRouteSnapshot,
  pathname: string,
  isApp?: boolean
): RouteIdentity | undefined {
  const definition = snapshot.identitiesByPathname.get(pathname)
  if (!definition || isApp === undefined) return definition

  const appRoute =
    definition.kind === RouteKind.APP_PAGE ||
    definition.kind === RouteKind.APP_ROUTE
  if (isApp) {
    return appRoute || definition.kind === RouteKind.PAGES_API
      ? definition
      : undefined
  }
  return appRoute ? undefined : definition
}

export function hasTurbopackPage(
  snapshot: TurbopackDevRouteSnapshot,
  pathname: string
): boolean {
  try {
    // Preserve invalid-path handling without probing the filesystem.
    normalizePagePath(pathname)
    return snapshot.presence.has(ensureLeadingSlash(pathname))
  } catch {
    return false
  }
}
