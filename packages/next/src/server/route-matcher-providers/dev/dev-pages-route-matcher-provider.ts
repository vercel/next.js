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

  // Preserve unchanged matchers when a route is added or removed. The parent
  // provider can only reuse its cache when the complete file list is equal.
  private readonly matcherCache = new Map<string, PagesRouteMatcher>()

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
    const retained = new Set<string>()

    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.test(filename)) continue

      retained.add(filename)
      let matcher = this.matcherCache.get(filename)

      if (!matcher) {
        const pathname = this.normalizers.pathname.normalize(filename)
        const page = this.normalizers.page.normalize(filename)
        const bundlePath = this.normalizers.bundlePath.normalize(filename)

        matcher = this.localeNormalizer
          ? new PagesLocaleRouteMatcher({
              kind: RouteKind.PAGES,
              pathname,
              page,
              bundlePath,
              filename,
              i18n: {},
            })
          : new PagesRouteMatcher({
              kind: RouteKind.PAGES,
              pathname,
              page,
              bundlePath,
              filename,
            })

        this.matcherCache.set(filename, matcher)
      }

      matchers.push(matcher)
    }

    for (const filename of this.matcherCache.keys()) {
      if (!retained.has(filename)) this.matcherCache.delete(filename)
    }

    return matchers
  }
}
