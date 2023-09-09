import type { FileReader } from '../../helpers/file-reader/file-reader'

import path from 'path'
import { DevPagesPageNormalizer } from '../../normalizers/built/pages/pages-page-normalizer'
import { DevRouteDefinitionProvider } from './dev-route-definition-provider'
import { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'
import { PagesAPIRouteDefinitionBuilder } from '../../route-definition-builders/pages-api-route-definition-builder'
import { RouteKind } from '../../route-kind'

export class DevPagesAPIRouteDefinitionProvider extends DevRouteDefinitionProvider<PagesAPIRouteDefinition> {
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

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<PagesAPIRouteDefinition> {
    const builder = new PagesAPIRouteDefinitionBuilder()
    for (const filename of filenames) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

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

        // If it's still not a match, then skip it.
        if (!matched) continue
      }

      const page = this.normalizer.normalize(filename)

      builder.add({ page, filename })
    }

    return builder.build()
  }
}
