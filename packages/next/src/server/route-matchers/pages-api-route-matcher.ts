import path from 'path'
import { isAPIRoute } from '../../lib/is-api-route'
import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { NodeManifestLoader } from '../manifest-loaders/node-manifest-loader'
import { RouteKind } from '../route-kind'
import { RouteDefinition, RouteMatcher } from './route-matcher'

export class PagesAPIRouteMatcher implements RouteMatcher<RouteKind.PAGES_API> {
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader = new NodeManifestLoader(
      distDir
    )
  ) {}

  public async routes(): Promise<
    ReadonlyArray<RouteDefinition<RouteKind.PAGES_API>>
  > {
    const manifest = await this.manifestLoader.load(PAGES_MANIFEST)

    return (
      Object.keys(manifest)
        // This matcher is only for Pages API routes.
        .filter((page) => isAPIRoute(page))
        // Normalize the routes.
        .reduce<Array<RouteDefinition<RouteKind.PAGES_API>>>((routes, page) => {
          const pathname = page

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            kind: RouteKind.PAGES_API,
            pathname,
            filename: path.join(this.distDir, SERVER_DIRECTORY, manifest[page]),
            page,
            bundlePath: path.join('pages', page),
          })

          return routes
        }, [])
    )
  }
}
