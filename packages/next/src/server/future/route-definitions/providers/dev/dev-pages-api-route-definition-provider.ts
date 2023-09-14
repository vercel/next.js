import type { FileReader } from '../../../helpers/file-reader/file-reader'

import path from 'path'
import { DevPagesPageNormalizer } from '../../../normalizers/built/pages/pages-page-normalizer'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { PagesAPIRouteDefinition } from '../../pages-api-route-definition'
import { PagesAPIRouteDefinitionBuilder } from '../../builders/pages-api-route-definition-builder'
import { RouteKind } from '../../../route-kind'

export class DevPagesAPIRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<PagesAPIRouteDefinition> {
  public readonly kind = RouteKind.PAGES_API

  private readonly expression: RegExp
  private readonly normalizer: DevPagesPageNormalizer

  constructor(
    private readonly pagesDir: string,
    private extensions: ReadonlyArray<string>,
    reader: FileReader
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

    // Check to see that this exists in the pages/api/ directory.
    let matched = filename.startsWith(path.join(this.pagesDir, '/api/'))

    // If it was not there, it could still be a match if it's filename is
    // `pages/api.${extension}`.
    if (!matched) {
      // We can also match if we have `pages/api.${extension}`, so check to
      // see if it's a match.
      for (const extension of this.extensions) {
        matched = filename === path.join(this.pagesDir, `api.${extension}`)
        if (matched) break
      }
    }

    return matched
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<PagesAPIRouteDefinition> {
    const builder = new PagesAPIRouteDefinitionBuilder()
    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      builder.add({ page, filename })
    }

    return builder.build()
  }
}
