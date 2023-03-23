import { FileReader } from './helpers/file-reader/file-reader'
import { AppRouteRouteMatcher } from '../../route-matchers/app-route-route-matcher'
import { Normalizer } from '../../normalizers/normalizer'
import { Normalizers } from '../../normalizers/normalizers'
import { AbsoluteFilenameNormalizer } from '../../normalizers/absolute-filename-normalizer'
import { wrapNormalizerFn } from '../../normalizers/wrap-normalizer-fn'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { PrefixingNormalizer } from '../../normalizers/prefixing-normalizer'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { isAppRouteRoute } from '../../../../lib/is-app-route-route'

export class DevAppRouteRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(appDir, reader)

    const pageNormalizer = new AbsoluteFilenameNormalizer(
      appDir,
      extensions,
      'app'
    )

    this.normalizers = {
      page: pageNormalizer,
      pathname: new Normalizers([
        pageNormalizer,
        // The pathname to match should have the trailing `/route` and other route
        // group information stripped from it.
        wrapNormalizerFn(normalizeAppPath),
      ]),
      bundlePath: new Normalizers([
        pageNormalizer,
        // Prefix the bundle path with `app/`.
        new PrefixingNormalizer('app'),
      ]),
    }
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    const matchers: Array<AppRouteRouteMatcher> = []
    for (const filename of files) {
      const page = this.normalizers.page.normalize(filename)

      // If the file isn't a match for this matcher, then skip it.
      if (!isAppRouteRoute(page)) continue

      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

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
