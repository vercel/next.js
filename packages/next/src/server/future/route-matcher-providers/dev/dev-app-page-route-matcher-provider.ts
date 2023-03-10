import { FileReader } from './helpers/file-reader/file-reader'
import { AppPageRouteMatcher } from '../../route-matchers/app-page-route-matcher'
import { Normalizer } from '../../normalizers/normalizer'
import { AbsoluteFilenameNormalizer } from '../../normalizers/absolute-filename-normalizer'
import { Normalizers } from '../../normalizers/normalizers'
import { wrapNormalizerFn } from '../../normalizers/wrap-normalizer-fn'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { PrefixingNormalizer } from '../../normalizers/prefixing-normalizer'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'

export class DevAppPageRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppPageRouteMatcher> {
  private readonly expression: RegExp
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

    // Match any page file that ends with `/page.${extension}` under the app
    // directory.
    this.expression = new RegExp(`[/\\\\]page\\.(?:${extensions.join('|')})$`)

    const pageNormalizer = new AbsoluteFilenameNormalizer(appDir, extensions)

    this.normalizers = {
      page: pageNormalizer,
      pathname: new Normalizers([
        pageNormalizer,
        // The pathname to match should have the trailing `/page` and other route
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
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const cache = new Map<
      string,
      { page: string; pathname: string; bundlePath: string }
    >()
    const appPaths: Record<string, string[]> = {}
    for (const filename of files) {
      const page = this.normalizers.page.normalize(filename)
      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      // Save the normalization results.
      cache.set(filename, { page, pathname, bundlePath })

      if (pathname in appPaths) appPaths[pathname].push(page)
      else appPaths[pathname] = [page]
    }

    const matchers: Array<AppPageRouteMatcher> = []
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

      // Grab the cached values (and the appPaths).
      const cached = cache.get(filename)
      if (!cached) {
        throw new Error('Invariant: expected filename to exist in cache')
      }
      const { pathname, page, bundlePath } = cached

      matchers.push(
        new AppPageRouteMatcher({
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath,
          filename,
          appPaths: appPaths[pathname],
        })
      )
    }

    return matchers
  }
}
