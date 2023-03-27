import { isAppPageRoute } from '../../../lib/is-app-page-route'
import {
  APP_PATHS_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../shared/lib/constants'
import path from '../../../shared/lib/isomorphic/path'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import { Normalizers } from '../normalizers/normalizers'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'
import { UnderscoreNormalizer } from '../normalizers/underscore-normalizer'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import { AppPageRouteMatcher } from '../route-matchers/app-page-route-matcher'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { ManifestRouteMatcherProvider } from './manifest-route-matcher-provider'

export class AppPageRouteMatcherProvider extends ManifestRouteMatcherProvider<AppPageRouteMatcher> {
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
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    // This matcher only matches app pages.
    const pages = Object.keys(manifest).filter((page) => isAppPageRoute(page))

    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const appPaths: Record<string, string[]> = {}
    for (const page of pages) {
      const pathname = this.normalizers.pathname.normalize(page)
      if (pathname in appPaths) appPaths[pathname].push(page)
      else appPaths[pathname] = [page]
    }

    // Format the routes.
    const matchers: Array<AppPageRouteMatcher> = []
    for (const [pathname, paths] of Object.entries(appPaths)) {
      // TODO-APP: (wyattjoh) this is a hack right now, should be more deterministic
      const page = paths[0]

      const filename = path.join(this.distDir, SERVER_DIRECTORY, manifest[page])
      const bundlePath = this.normalizers.bundlePath.normalize(page)

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
