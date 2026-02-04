import { isAppPageRoute } from '../../lib/is-app-page-route'

import { APP_PATHS_MANIFEST } from '../../shared/lib/constants'
import { AppNormalizers } from '../normalizers/built/app'
import { RouteKind } from '../route-kind'
import { AppPageRouteMatcher } from '../route-matchers/app-page-route-matcher'
import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'

export class AppPageRouteMatcherProvider extends ManifestRouteMatcherProvider<AppPageRouteMatcher> {
  private readonly normalizers: AppNormalizers

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizers = new AppNormalizers(distDir)
  }

  protected async transform(
    manifest: Manifest
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    // This matcher only matches app pages.
    const pages = Object.keys(manifest).filter((page) => isAppPageRoute(page))

    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const allAppPaths: Record<string, string[]> = {}
    for (const page of pages) {
      const pathname = this.normalizers.pathname.normalize(page)
      if (pathname in allAppPaths) allAppPaths[pathname].push(page)
      else allAppPaths[pathname] = [page]
    }

    // Format the routes.
    const matchers: Array<AppPageRouteMatcher> = []
    for (const [pathname, appPaths] of Object.entries(allAppPaths)) {
      // TODO-APP: (wyattjoh) this is a hack right now, should be more deterministic
      const page = appPaths[0]

      const filename = this.normalizers.filename.normalize(manifest[page])
      const bundlePath = this.normalizers.bundlePath.normalize(page)

      matchers.push(
        new AppPageRouteMatcher({
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath,
          filename,
          appPaths,
        })
      )
    }

    return matchers
  }
}
