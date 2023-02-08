import path from '../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { AbsoluteFilenameNormalizer } from '../normalizers/absolute-filename-normalizer'
import { Normalizer } from '../normalizers/normalizer'
import { Normalizers } from '../normalizers/normalizers'
import { PrefixingNormalizer } from '../normalizers/prefixing-normalizer'
import { wrapNormalizerFn } from '../normalizers/wrap-normalizer-fn'
import { RouteKind } from '../route-kind'
import { DevFSRouteMatcher } from './dev-fs-route-matcher'
import { FileReader } from './file-reader/file-reader'

export class DevPagesAPIRouteMatcher extends DevFSRouteMatcher<RouteKind.PAGES_API> {
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
      // If the file does not end in the correct extension, then it's not a
      // match.
      if (!matcher.test(filename)) return false

      // Pages API routes must exist in the pages directory with the `/api/`
      // prefix. The pathnames being tested here though are the full filenames,
      // so we need to include the pages directory.
      if (filename.startsWith(path.join(pagesDir, '/api/'))) return true

      for (const extension of extensions) {
        // We can also match if we have `pages/api.${extension}`, so check to
        // see if it's a match.
        if (filename === path.join(pagesDir, `api.${extension}`)) {
          return true
        }
      }

      return false
    }

    const filenameNormalizer = new AbsoluteFilenameNormalizer(
      pagesDir,
      extensions
    )

    const pathnameNormalizer = new Normalizers([filenameNormalizer])

    const bundlePathNormalizer = new Normalizers([
      filenameNormalizer,
      // If the bundle path would have ended in a `/`, add a `index` to it.
      // new RootIndexNormalizer(),
      wrapNormalizerFn(normalizePagePath),
      // Prefix the bundle path with `pages/`.
      new PrefixingNormalizer('pages'),
    ])

    // If configured, normalize the pathname for locales.
    if (localeNormalizer) pathnameNormalizer.push(localeNormalizer)

    super({
      dir: pagesDir,
      filter,
      pageNormalizer: filenameNormalizer,
      pathnameNormalizer,
      bundlePathNormalizer,
      kind: RouteKind.PAGES_API,
      reader,
    })
  }
}
