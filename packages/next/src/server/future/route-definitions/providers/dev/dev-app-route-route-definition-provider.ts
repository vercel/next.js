import type { AppRouteRouteDefinition } from '../../app-route-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import { DevAppPageNormalizer } from '../../../normalizers/built/app/app-page-normalizer'
import { AppRouteRouteDefinitionBuilder } from '../../builders/app-route-route-definition-builder'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { RouteKind } from '../../../route-kind'
import { normalizeMetadataRoute } from '../../../../../lib/metadata/get-metadata-route'
import { isMetadataRoute } from '../../../../../lib/metadata/is-metadata-route'

export class DevAppRouteRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<AppRouteRouteDefinition> {
  public readonly kind = RouteKind.APP_ROUTE

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

    this.expression = new RegExp(`[/\\\\]route\\.(?:${extensions.join('|')})$`)
    this.normalizer = new DevAppPageNormalizer(appDir, extensions)
  }

  protected filterFilename(filename: string): boolean {
    const page = this.normalizer.normalize(filename)

    // Validate that this is not an ignored page, and skip it if it is.
    if (page.includes('/_')) return false

    // If this is a metadata route, then include it.
    if (isMetadataRoute(page)) return true

    // If the file isn't a match for this matcher, then skip it.
    if (!this.expression.test(filename)) return false

    return true
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<AppRouteRouteDefinition> {
    const builder = new AppRouteRouteDefinitionBuilder()

    for (const filename of filenames) {
      const page = normalizeMetadataRoute(this.normalizer.normalize(filename))

      // Collect all the app paths for this page.
      builder.add({ page, filename })
    }

    return builder.build()
  }
}
