import { isAppRouteRoute } from '../../lib/is-app-route-route'
import { APP_PATHS_MANIFEST } from '../../shared/lib/constants'
import { RouteKind } from '../route-kind'
import { AppRouteRouteMatcher } from '../route-matchers/app-route-route-matcher'
import type {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import { AppNormalizers } from '../normalizers/built/app'

export class AppRouteRouteMatcherProvider extends ManifestRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers: AppNormalizers

  constructor(distDir: string, manifestLoader: ManifestLoader) {
    super(APP_PATHS_MANIFEST, manifestLoader)

    this.normalizers = new AppNormalizers(distDir)
  }

  protected async transform(
    manifest: Manifest
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    // This matcher only matches app routes.
    const pages = Object.keys(manifest).filter((page) => isAppRouteRoute(page))

    // Format the routes.
    const matchers: Array<AppRouteRouteMatcher> = []
    for (const page of pages) {
      const filename = this.normalizers.filename.normalize(manifest[page])
      const pathname = this.normalizers.pathname.normalize(page)
      const bundlePath = this.normalizers.bundlePath.normalize(page)

      matchers.push(
        new AppRouteRouteMatcher({
          kind: RouteKind.APP_ROUTE,
          pathname,
          page,
          bundlePath,
          filename,
        })
      )
    }

    return matchers
  }
}
