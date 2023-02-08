import path from 'path'
import { isAppRouteRoute } from '../../lib/is-app-route-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../shared/lib/constants'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { NodeManifestLoader } from '../manifest-loaders/node-manifest-loader'
import { RouteKind } from '../route-kind'
import { RouteDefinition, RouteMatcher } from './route-matcher'

export class AppRouteRouteMatcher implements RouteMatcher<RouteKind.APP_ROUTE> {
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader = new NodeManifestLoader(
      distDir
    )
  ) {}

  public async routes(): Promise<
    ReadonlyArray<RouteDefinition<RouteKind.APP_ROUTE>>
  > {
    const manifest = await this.manifestLoader.load(APP_PATHS_MANIFEST)

    return (
      Object.keys(manifest)
        // This matcher only matches app routes.
        .filter((page) => isAppRouteRoute(page))
        // Normalize the routes.
        .reduce<Array<RouteDefinition<RouteKind.APP_ROUTE>>>((routes, page) => {
          const pathname = normalizeAppPath(page)

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            kind: RouteKind.APP_ROUTE,
            pathname,
            filename: path.join(this.distDir, SERVER_DIRECTORY, manifest[page]),
            page,
            bundlePath: path.join('app', page),
          })

          return routes
        }, [])
    )
  }
}
