import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { AbsoluteFilenameNormalizer } from '../normalizers/absolute-filename-normalizer'
import { Normalizers } from '../normalizers/normalizers'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import { DevFSRouteMatcher } from './dev-fs-route-matcher'
import { FileReader } from './file-reader/file-reader'

export class DevAppRouteRouteMatcher extends DevFSRouteMatcher<RouteKind.APP_ROUTE> {
  constructor(appDir: string, extensions: string[], reader?: FileReader) {
    // Match any route file that ends with `/route.${extension}` under the app
    // directory.
    const matcher = new RegExp(`\\/route\\.(?:${extensions.join('|')})$`)
    const filter = (pathname: string) => matcher.test(pathname)

    const filenameNormalizer = new AbsoluteFilenameNormalizer(
      appDir,
      extensions
    )

    const pageNormalizer = new Normalizers([filenameNormalizer])

    const pathnameNormalizer = new Normalizers([
      filenameNormalizer,
      // The pathname to match should have the trailing `/route` and other route
      // group information stripped from it.
      wrapNormalizerFn(normalizeAppPath),
    ])

    super({
      dir: appDir,
      filter,
      pageNormalizer,
      pathnameNormalizer,
      bundlePathNormalizer: new Normalizers([
        filenameNormalizer,
        // Prefix the bundle path with `app/`.
        new PrefixingNormalizer('app'),
      ]),
      kind: RouteKind.APP_ROUTE,
      reader,
    })
  }
}
