import type { AppPageRouteDefinition } from '../../app-page-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { AppPageRouteDefinitionBuilder } from '../../builders/app-page-route-definition-builder'
import { DevAppPageNormalizer } from '../../../normalizers/built/app/app-page-normalizer'
import { RouteKind } from '../../../route-kind'

export class DevAppPageRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<AppPageRouteDefinition> {
  public readonly kind = RouteKind.APP_PAGE
  private readonly normalizer: DevAppPageNormalizer

  // Match any page file that ends with `/page.${extension}` under the app
  // directory.
  private readonly expression: RegExp

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(appDir, reader)

    this.expression = new RegExp(`[/\\\\]page\\.(?:${extensions.join('|')})$`)
    this.normalizer = new DevAppPageNormalizer(appDir, extensions)
  }

  protected filterFilename(filename: string): boolean {
    // If the file isn't a match for this matcher, then skip it.
    if (!this.expression.test(filename)) return false

    const page = this.normalizer.normalize(filename)

    // Validate that this is not an ignored page, and skip it if it is.
    if (page.includes('/_')) return false

    return true
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<AppPageRouteDefinition> {
    const builder = new AppPageRouteDefinitionBuilder()

    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      // Collect all the app paths for this page.
      builder.add({ page, filename })
    }

    return builder.build()
  }
}
