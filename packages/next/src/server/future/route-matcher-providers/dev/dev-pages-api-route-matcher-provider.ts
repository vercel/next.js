import { Normalizer } from '../../normalizers/normalizer'
import { FileReader } from './helpers/file-reader/file-reader'
import {
  PagesAPILocaleRouteMatcher,
  PagesAPIRouteMatcher,
} from '../../route-matchers/pages-api-route-matcher'
import { AbsoluteFilenameNormalizer } from '../../normalizers/absolute-filename-normalizer'
import { Normalizers } from '../../normalizers/normalizers'
import { wrapNormalizerFn } from '../../normalizers/wrap-normalizer-fn'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { PrefixingNormalizer } from '../../normalizers/prefixing-normalizer'
import { RouteKind } from '../../route-kind'
import path from 'path'
import { LocaleRouteNormalizer } from '../../normalizers/locale-route-normalizer'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'

export class DevPagesAPIRouteMatcherProvider extends FileCacheRouteMatcherProvider<PagesAPIRouteMatcher> {
  private readonly expression: RegExp
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }

  constructor(
    private readonly pagesDir: string,
    private readonly extensions: ReadonlyArray<string>,
    reader: FileReader,
    private readonly localeNormalizer?: LocaleRouteNormalizer
  ) {
    super(pagesDir, reader)

    // Match any route file that ends with `/${filename}.${extension}` under the
    // pages directory.
    this.expression = new RegExp(`\\.(?:${extensions.join('|')})$`)

    const pageNormalizer = new AbsoluteFilenameNormalizer(pagesDir, extensions)

    const bundlePathNormalizer = new Normalizers([
      pageNormalizer,
      // If the bundle path would have ended in a `/`, add a `index` to it.
      wrapNormalizerFn(normalizePagePath),
      // Prefix the bundle path with `pages/`.
      new PrefixingNormalizer('pages'),
    ])

    this.normalizers = {
      page: pageNormalizer,
      pathname: pageNormalizer,
      bundlePath: bundlePathNormalizer,
    }
  }

  private test(filename: string): boolean {
    // If the file does not end in the correct extension it's not a match.
    if (!this.expression.test(filename)) return false

    // Pages API routes must exist in the pages directory with the `/api/`
    // prefix. The pathnames being tested here though are the full filenames,
    // so we need to include the pages directory.

    // TODO: could path separator normalization be needed here?
    if (filename.startsWith(path.join(this.pagesDir, '/api/'))) return true

    for (const extension of this.extensions) {
      // We can also match if we have `pages/api.${extension}`, so check to
      // see if it's a match.
      if (filename === path.join(this.pagesDir, `api.${extension}`)) {
        return true
      }
    }

    return false
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<PagesAPIRouteMatcher>> {
    const matchers: Array<PagesAPIRouteMatcher> = []
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.test(filename)) continue

      const pathname = this.normalizers.pathname.normalize(filename)
      const page = this.normalizers.page.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      if (this.localeNormalizer) {
        matchers.push(
          new PagesAPILocaleRouteMatcher({
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath,
            filename,
            i18n: {},
          })
        )
      } else {
        matchers.push(
          new PagesAPIRouteMatcher({
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath,
            filename,
          })
        )
      }
    }

    return matchers
  }
}
