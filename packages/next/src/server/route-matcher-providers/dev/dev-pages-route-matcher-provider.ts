import type { FileReader } from './helpers/file-reader/file-reader'
import {
  PagesRouteMatcher,
  PagesLocaleRouteMatcher,
} from '../../route-matchers/pages-route-matcher'
import { RouteKind } from '../../route-kind'
import path from 'path'
import type { LocaleRouteNormalizer } from '../../normalizers/locale-route-normalizer'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { DevPagesNormalizers } from '../../normalizers/built/pages'

export class DevPagesRouteMatcherProvider extends FileCacheRouteMatcherProvider<PagesRouteMatcher> {
  private readonly expression: RegExp
  private readonly normalizers: DevPagesNormalizers

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

    this.normalizers = new DevPagesNormalizers(pagesDir, extensions)
  }

  private test(filename: string): boolean {
    // If the file does not end in the correct extension it's not a match.
    if (!this.expression.test(filename)) return false

    // Pages routes must exist in the pages directory without the `/api/`
    // prefix. The pathnames being tested here though are the full filenames,
    // so we need to include the pages directory.

    // TODO: could path separator normalization be needed here?
    if (filename.startsWith(path.join(this.pagesDir, '/api/'))) return false

    for (const extension of this.extensions) {
      // We can also match if we have `pages/api.${extension}`, so check to
      // see if it's a match.
      if (filename === path.join(this.pagesDir, `api.${extension}`)) {
        return false
      }
    }

    return true
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<PagesRouteMatcher>> {
    const matchers: Array<PagesRouteMatcher> = []
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.test(filename)) continue

      const pathname = this.normalizers.pathname.normalize(filename)
      const page = this.normalizers.page.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      if (this.localeNormalizer) {
        matchers.push(
          new PagesLocaleRouteMatcher({
            kind: RouteKind.PAGES,
            pathname,
            page,
            bundlePath,
            filename,
            i18n: {},
          })
        )
      } else {
        matchers.push(
          new PagesRouteMatcher({
            kind: RouteKind.PAGES,
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
