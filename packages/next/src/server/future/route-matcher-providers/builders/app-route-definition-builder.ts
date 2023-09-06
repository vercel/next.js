import type { PagesManifest } from '../../../../build/webpack/plugins/pages-manifest-plugin'
import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'

import { isAppRouteRoute } from '../../../../lib/is-app-route-route'
import { AppBundlePathNormalizer } from '../../normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../route-kind'

export class AppRouteDefinitionBuilder {
  private static readonly normalizers = {
    pathname: new AppPathnameNormalizer(),
    bundlePath: new AppBundlePathNormalizer(),
  }

  private readonly definitions = new Map<
    string,
    AppPageRouteDefinition | AppRouteRouteDefinition
  >()
  private readonly appPaths = new Map<string, string[]>()

  static fromManifest(manifest: PagesManifest): AppRouteDefinitionBuilder {
    const routes = new AppRouteDefinitionBuilder()

    for (const [page, filename] of Object.entries(manifest)) {
      routes.add(page, filename)
    }

    return routes
  }

  public toManifest(): PagesManifest {
    const manifest: PagesManifest = {}

    for (const definition of this.definitions.values()) {
      manifest[definition.page] = definition.filename
    }

    return manifest
  }

  public add(page: string, filename: string): string {
    const pathname =
      AppRouteDefinitionBuilder.normalizers.pathname.normalize(page)
    const bundlePath =
      AppRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    let appPaths = this.appPaths.get(pathname)
    if (!appPaths) {
      appPaths = [page]
      this.appPaths.set(pathname, appPaths)
    } else {
      appPaths.push(page)

      // Sort the app paths so that we can compare them with other app paths,
      // the order must be deterministic.
      appPaths.sort()
    }

    // If the page is an app route route, then we can add it to the definitions
    // map immediately, there is no need to check if it has any app paths.
    if (isAppRouteRoute(page)) {
      this.definitions.set(page, {
        kind: RouteKind.APP_ROUTE,
        bundlePath,
        filename,
        page,
        pathname,
      })
    } else {
      this.definitions.set(page, {
        kind: RouteKind.APP_PAGE,
        bundlePath,
        filename,
        page,
        pathname,
        // The appPaths array here is a reference to the one in the appPaths map,
        // so this will re-use the same array (and any sort or push that occurs
        // in the future).
        appPaths,
      })
    }

    return pathname
  }

  /**
   * Get the pathnames that have app paths, sorted.
   *
   * @returns the pathnames that have app paths
   */
  public pathnames(): ReadonlyArray<string> {
    return Array.from(this.appPaths.keys()).sort()
  }

  public get(
    pathname: string
  ): AppPageRouteDefinition | AppRouteRouteDefinition | null {
    const appPaths = this.appPaths.get(pathname)
    if (!Array.isArray(appPaths)) return null

    // The page is always the last app path.
    const page = appPaths[appPaths.length - 1]

    // Get the definition for the page. We know that this will always return a
    // value because we can only get app paths from the app paths map if the
    // page exists in the definitions map.
    return this.definitions.get(page)!
  }

  /**
   * Get the entries of the app paths.
   *
   * @returns the entries of the app paths
   */
  public toSortedDefinitions(): ReadonlyArray<
    AppPageRouteDefinition | AppRouteRouteDefinition
  > {
    const definitions: Array<AppPageRouteDefinition | AppRouteRouteDefinition> =
      []
    for (const pathname of this.pathnames()) {
      // We know that this will always return a value because we only add
      // pathnames that have app paths.
      const definition = this.get(pathname)!

      definitions.push(definition)
    }

    return definitions
  }
}
