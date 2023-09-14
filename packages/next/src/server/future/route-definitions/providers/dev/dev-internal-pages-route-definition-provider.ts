import type { InternalPagesRouteDefinition } from '../../internal-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'

import { isInternalPagesRoute } from '../../../../../lib/is-internal-pages-route'
import { DevPagesPageNormalizer } from '../../../normalizers/built/pages/pages-page-normalizer'
import { InternalPagesRouteDefinitionBuilder } from '../../builders/internal-pages-route-definition-builder'
import { RouteKind } from '../../../route-kind'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { RouteDefinitionProvider } from '../route-definition-provider'

export class DevInternalPagesRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<InternalPagesRouteDefinition> {
  public readonly kind = RouteKind.INTERNAL_PAGES

  private readonly normalizer: DevPagesPageNormalizer

  constructor(
    pagesDir: string,
    pageExtensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(pagesDir, reader)

    this.normalizer = new DevPagesPageNormalizer(pagesDir, pageExtensions)
  }

  protected filterFilename(filename: string): boolean {
    const page = this.normalizer.normalize(filename)

    // Skip any pages that are not internal pages.
    return isInternalPagesRoute(page)
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<InternalPagesRouteDefinition> {
    const builder = new InternalPagesRouteDefinitionBuilder()

    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      builder.add({ page, filename, localeInfo: undefined, builtIn: false })
    }

    // Provide the built-in error page.
    builder.add({
      page: '/_error',
      filename: require.resolve('next/dist/pages/_error'),
      localeInfo: undefined,
      builtIn: true,
    })

    return builder.build()
  }
}

export class DevInternalBuiltInPagesRouteDefinitionProvider
  implements RouteDefinitionProvider<InternalPagesRouteDefinition>
{
  public readonly kind = RouteKind.INTERNAL_PAGES

  public provide(): ReadonlyArray<InternalPagesRouteDefinition> {
    const builder = new InternalPagesRouteDefinitionBuilder()

    // Provide the built-in error page.
    builder.add({
      page: '/_error',
      filename: require.resolve('next/dist/pages/_error'),
      localeInfo: undefined,
      builtIn: true,
    })

    return builder.build()
  }
}
