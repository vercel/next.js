import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { AbsoluteFilenameNormalizer } from '../normalizers/absolute-filename-normalizer'
import { Normalizer } from '../normalizers/normalizer'
import { Normalizers } from '../normalizers/normalizers'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import { DevFSRouteMatcher } from './dev-fs-route-matcher'
import { FileReader } from './file-reader/file-reader'

export class DevPagesRouteMatcher extends DevFSRouteMatcher<RouteKind.PAGES> {
  constructor(
    pagesDir: string,
    extensions: string[],
    localeNormalizer?: Normalizer,
    reader?: FileReader
  ) {
    // Match any route file that ends with `/${filename}.${extension}` under the
    // pages directory.
    const matcher = new RegExp(`\\.(?:${extensions.join('|')})$`)
    const filter = (filename: string) => {
      // Pages routes must exist in the pages directory without the `/api/`
      // prefix. The pathnames being tested here though are the full filenames,
      // so we need to include the pages directory.
      if (filename.startsWith(`${pagesDir}/api/`)) return false

      return matcher.test(filename)
    }

    const absolutePathNormalizer = new AbsoluteFilenameNormalizer(
      pagesDir,
      extensions
    )

    const pageNormalizer = new Normalizers([absolutePathNormalizer])

    const pathnameNormalizer = new Normalizers([absolutePathNormalizer])

    const bundlePathNormalizer = new Normalizers([
      absolutePathNormalizer,
      // If the bundle path would have ended in a `/`, add a `index` to it.
      wrapNormalizerFn(normalizePagePath),
      // Prefix the bundle path with `pages/`.
      new PrefixingNormalizer('pages'),
    ])

    // If configured, normalize the pathname for locales.
    if (localeNormalizer) pathnameNormalizer.push(localeNormalizer)

    super({
      dir: pagesDir,
      filter,
      pageNormalizer,
      pathnameNormalizer,
      bundlePathNormalizer,
      kind: RouteKind.PAGES,
      reader,
    })
  }
}
