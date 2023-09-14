import type { I18NProvider } from '../../../helpers/i18n-provider'
import type {
  PagesRouteDefinition,
  PagesLocaleRouteDefinition,
} from '../../pages-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import path from 'path'
import { BLOCKED_PAGES } from '../../../../../shared/lib/constants'
import { DevPagesPageNormalizer } from '../../../normalizers/built/pages/pages-page-normalizer'
import { PagesRouteDefinitionBuilder } from '../../builders/pages-route-definition-builder'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { RouteKind } from '../../../route-kind'

export class DevPagesRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<
  PagesRouteDefinition | PagesLocaleRouteDefinition
> {
  public readonly kind = RouteKind.PAGES

  private readonly expression: RegExp
  private readonly normalizer: DevPagesPageNormalizer

  constructor(
    private readonly pagesDir: string,
    private extensions: ReadonlyArray<string>,
    reader: FileReader,
    private readonly i18nProvider: I18NProvider | null
  ) {
    super(pagesDir, reader)

    // Match any route file that ends with `/${filename}.${extension}` under the
    // pages directory.
    this.expression = new RegExp(`\\.(?:${extensions.join('|')})$`)
    this.normalizer = new DevPagesPageNormalizer(pagesDir, extensions)
  }

  protected filterFilename(filename: string): boolean {
    // If the file isn't a match for this matcher, then skip it.
    if (!this.expression.test(filename)) return false

    // Pages routes must exist in the pages directory without the `/api/`
    // prefix. The pathnames being tested here though are the full filenames,
    // so we need to include the pages directory.

    // TODO: could path separator normalization be needed here?
    if (filename.startsWith(path.join(this.pagesDir, '/api/'))) return false

    // We can also match if we have `pages/api.${extension}`, so check to
    // see if it's a match.
    for (const extension of this.extensions) {
      if (filename === path.join(this.pagesDir, `api.${extension}`)) {
        return false
      }
    }

    return true
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<PagesRouteDefinition | PagesLocaleRouteDefinition> {
    const builder = new PagesRouteDefinitionBuilder()

    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      // If enabled, we should analyze the page for locale information.
      const localeInfo = this.i18nProvider?.analyze(page)

      // If the locale information is available, we should use the pathname
      // instead of the page name (which is the pathname as well).
      const pathname = localeInfo?.pathname ?? page

      // Remove any blocked pages (page that can't be routed to, like error or
      // internal pages).
      if (BLOCKED_PAGES.includes(pathname)) continue

      builder.add({ page, filename, pathname, localeInfo })
    }

    return builder.build()
  }
}
