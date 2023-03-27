import path from '../../../shared/lib/isomorphic/path'
import { isAppRouteRoute } from '../../../lib/is-app-route-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../shared/lib/constants'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { RouteKind } from '../route-kind'
import { AppRouteRouteMatcher } from '../route-matchers/app-route-route-matcher'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'
import { Normalizers } from '../normalizers/normalizers'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'
import { UnderscoreNormalizer } from '../normalizers/underscore-normalizer'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'

export class AppRouteRouteMatcherProvider extends ManifestRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers = {
    pathname: new Normalizers([
      wrapNormalizerFn(normalizeAppPath),
      new UnderscoreNormalizer(),
    ]),
    bundlePath: new PrefixingNormalizer('app'),
  }

  constructor(
    private readonly distDir: string,
    manifestLoader: ManifestLoader
  ) {
    super(APP_PATHS_MANIFEST, manifestLoader)
  }

  protected async transform(
    manifest: Manifest
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    // This matcher only matches app routes.
    const pages = Object.keys(manifest).filter((page) => isAppRouteRoute(page))

    // Format the routes.
    const matchers: Array<AppRouteRouteMatcher> = []
    for (const page of pages) {
      const pathname = this.normalizers.pathname.normalize(page)
      const filename = path.join(this.distDir, SERVER_DIRECTORY, manifest[page])
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
