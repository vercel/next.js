import { Normalizer } from '../../normalizers/normalizer'
import { FileReader } from './helpers/file-reader/file-reader'
import { DefaultFileReader } from './helpers/file-reader/default-file-reader'
import { PagesAPIRouteMatcher } from '../../route-matchers/pages-api-route-matcher'
import { RouteMatcherProvider } from '../route-matcher-provider'
import { AbsoluteFilenameNormalizer } from '../../normalizers/absolute-filename-normalizer'
import { Normalizers } from '../../normalizers/normalizers'
import { wrapNormalizerFn } from '../../normalizers/wrap-normalizer-fn'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { PrefixingNormalizer } from '../../normalizers/prefixing-normalizer'
import { RouteKind } from '../../route-kind'
import path from 'path'

export class DevPagesAPIRouteMatcherProvider
  implements RouteMatcherProvider<PagesAPIRouteMatcher>
{
  private readonly expression: RegExp
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }

  constructor(
    private readonly pagesDir: string,
    private readonly extensions: ReadonlyArray<string>,
    private readonly localeNormalizer?: Normalizer,
    private readonly reader: FileReader = new DefaultFileReader()
  ) {
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

  public async matchers(): Promise<ReadonlyArray<PagesAPIRouteMatcher>> {
    // Read the files in the pages directory...
    const files = await this.reader.read(this.pagesDir)

    const matchers: Array<PagesAPIRouteMatcher> = []
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.test(filename)) continue

      const pathname = this.normalizers.pathname.normalize(filename)
      const page = this.normalizers.page.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      // TODO: what do we do if this route is a duplicate?

      matchers.push(
        new PagesAPIRouteMatcher(
          {
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath,
            filename,
          },
          this.localeNormalizer
        )
      )
    }

    return matchers
  }
}
