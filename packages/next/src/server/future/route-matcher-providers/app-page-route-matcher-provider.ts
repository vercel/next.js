import { isAppPageRoute } from '../../../lib/is-app-page-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../shared/lib/constants'
import path from '../../../shared/lib/isomorphic/path'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { RouteKind } from '../route-kind'
import { AppPageRouteMatcher } from '../route-matchers/app-page-route-matcher'
import { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'
import { RouteMatcherProvider } from './route-matcher-provider'

export class AppPageRouteMatcherProvider
  implements RouteMatcherProvider<AppPageRouteMatcher>
{
  constructor(
    private readonly distDir: string,
    private readonly manifestLoader: ManifestLoader
  ) {}

  public async matchers(): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    const manifest = this.manifestLoader.load(APP_PATHS_MANIFEST)
    if (!manifest) return []

    // This matcher only matches app pages.
    const pages = Object.keys(manifest).filter((page) => isAppPageRoute(page))

    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const appPaths: Record<string, string[]> = {}
    for (const page of pages) {
      const pathname = normalizeAppPath(page)

      if (pathname in appPaths) appPaths[pathname].push(page)
      else appPaths[pathname] = [page]
    }

    // Format the routes.
    const matchers: Array<AppPageRouteMatcher> = []
    for (const [pathname, paths] of Object.entries(appPaths)) {
      // TODO-APP: (wyattjoh) this is a hack right now, should be more deterministic
      const page = paths[0]

      const filename = path.join(this.distDir, SERVER_DIRECTORY, manifest[page])
      const bundlePath = path.join('app', page)

      matchers.push(
        new AppPageRouteMatcher({
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath,
          filename,
          appPaths: paths,
        })
      )
    }

    return matchers
  }
}
