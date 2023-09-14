import type { InternalAppRouteDefinition } from '../../internal-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import { isInternalAppRoute } from '../../../../../lib/is-internal-app-route'
import { DevAppPageNormalizer } from '../../../normalizers/built/app/app-page-normalizer'
import { RouteKind } from '../../../route-kind'
import { InternalAppRouteDefinitionBuilder } from '../../builders/internal-app-route-definition-builder'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'

export class DevInternalAppRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<InternalAppRouteDefinition> {
  public readonly kind = RouteKind.INTERNAL_APP
  private readonly normalizer: DevAppPageNormalizer

  constructor(
    pagesDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(pagesDir, reader)

    this.normalizer = new DevAppPageNormalizer(pagesDir, extensions)
  }

  protected filterFilename(filename: string): boolean {
    const page = this.normalizer.normalize(filename)

    // Skip any pages that are not internal pages.
    return isInternalAppRoute(page)
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<InternalAppRouteDefinition> {
    const builder = new InternalAppRouteDefinitionBuilder()

    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      // Skip any pages that are not internal pages.
      if (!isInternalAppRoute(page)) continue

      builder.add({ page, filename, builtIn: false })
    }

    // Provide the built-in error page.
    builder.add({
      page: '/not-found',
      filename: require.resolve('next/dist/client/components/not-found-error'),
      builtIn: true,
    })

    return builder.build()
  }
}
