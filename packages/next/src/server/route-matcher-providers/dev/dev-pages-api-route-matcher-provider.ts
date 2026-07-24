import type { FileReader } from './helpers/file-reader/file-reader'
import {
  PagesAPILocaleRouteMatcher,
  PagesAPIRouteMatcher,
} from '../../route-matchers/pages-api-route-matcher'
import { RouteKind } from '../../route-kind'
import path from 'path'
import type { LocaleRouteNormalizer } from '../../normalizers/locale-route-normalizer'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { DevPagesNormalizers } from '../../normalizers/built/pages'

export class DevPagesAPIRouteMatcherProvider extends FileCacheRouteMatcherProvider<PagesAPIRouteMatcher> {
  private readonly expression: RegExp
  private readonly normalizers: DevPagesNormalizers

  // A matcher depends only on the immutable provider configuration and filename.
  private readonly matcherCache = new Map<string, PagesAPIRouteMatcher | null>()

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
    const retained = this.matcherCache.size > 0 ? new Set<string>() : undefined

    for (const filename of files) {
      retained?.add(filename)
      const cached = this.matcherCache.get(filename)
      if (cached !== undefined) {
        if (cached) matchers.push(cached)
        continue
      }

      // If the file isn't a match for this matcher, then skip it.
      if (!this.test(filename)) {
        this.matcherCache.set(filename, null)
        continue
      }

      const pathname = this.normalizers.pathname.normalize(filename)
      const page = this.normalizers.page.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)
      const matcher = this.localeNormalizer
        ? new PagesAPILocaleRouteMatcher({
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath,
            filename,
            i18n: {},
          })
        : new PagesAPIRouteMatcher({
            kind: RouteKind.PAGES_API,
            pathname,
            page,
            bundlePath,
            filename,
          })

      this.matcherCache.set(filename, matcher)
      matchers.push(matcher)
    }

    if (retained) {
      for (const filename of this.matcherCache.keys()) {
        if (!retained.has(filename)) this.matcherCache.delete(filename)
      }
    }

    return matchers
  }
}
