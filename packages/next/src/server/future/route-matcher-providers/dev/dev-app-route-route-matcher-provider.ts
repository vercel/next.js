import { FileReader } from './helpers/file-reader/file-reader'
import { DefaultFileReader } from './helpers/file-reader/default-file-reader'
import { AppRouteRouteMatcher } from '../../route-matchers/app-route-route-matcher'
import { RouteMatcherProvider } from '../route-matcher-provider'
import { Normalizer } from '../../normalizers/normalizer'
import { Normalizers } from '../../normalizers/normalizers'
import { AbsoluteFilenameNormalizer } from '../../normalizers/absolute-filename-normalizer'
import { wrapNormalizerFn } from '../../normalizers/wrap-normalizer-fn'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { PrefixingNormalizer } from '../../normalizers/prefixing-normalizer'
import { RouteKind } from '../../route-kind'

export class DevAppRouteRouteMatcherProvider
  implements RouteMatcherProvider<AppRouteRouteMatcher>
{
  private readonly expression: RegExp
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }

  constructor(
    private readonly appDir: string,
    extensions: ReadonlyArray<string>,
    private readonly reader: FileReader = new DefaultFileReader()
  ) {
    // Match any route file that ends with `/route.${extension}` under the app
    // directory.
    this.expression = new RegExp(`\\/route\\.(?:${extensions.join('|')})$`)

    const pageNormalizer = new AbsoluteFilenameNormalizer(appDir, extensions)

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

  public async matchers(): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    // Read the files in the pages directory...
    const files = await this.reader.read(this.appDir)

    const matchers: Array<AppRouteRouteMatcher> = []
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

      const page = this.normalizers.page.normalize(filename)
      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      // TODO: what do we do if this route is a duplicate?

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
