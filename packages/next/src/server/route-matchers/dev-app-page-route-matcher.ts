import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { Normalizers } from '../normalizers/normalizers'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import { DevFSRouteMatcher } from './dev-fs-route-matcher'
import { FileReader } from './file-reader/file-reader'
import { AbsoluteFilenameNormalizer } from '../normalizers/absolute-filename-normalizer'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'

export class DevAppPageRouteMatcher extends DevFSRouteMatcher<RouteKind.APP_PAGE> {
  constructor(appDir: string, extensions: string[], reader?: FileReader) {
    // Match any page file that ends with `/page.${extension}` under the app
    // directory.
    const matcher = new RegExp(`\\/page\\.(?:${extensions.join('|')})$`)
    const filter = (pathname: string) => matcher.test(pathname)

    const filenameNormalizer = new AbsoluteFilenameNormalizer(
      appDir,
      extensions
    )

    const pathnameNormalizer = new Normalizers([
      filenameNormalizer,
      // The pathname to match should have the trailing `/page` and other route
      // group information stripped from it.
      wrapNormalizerFn(normalizeAppPath),
    ])

    super({
      dir: appDir,
      filter,
      pageNormalizer: filenameNormalizer,
      pathnameNormalizer,
      bundlePathNormalizer: new Normalizers([
        filenameNormalizer,
        // Prefix the bundle path with `app/`.
        new PrefixingNormalizer('app'),
      ]),
      kind: RouteKind.APP_PAGE,
      reader,
    })
  }
}
