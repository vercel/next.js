import type { InternalRootRouteDefinition } from '../../internal-route-definition'
import type { FileReader } from '../../../helpers/file-reader/file-reader'
import type { Normalizer } from '../../../normalizers/normalizer'

import path from 'path'
import { RouteKind } from '../../../route-kind'
import { InternalRootRouteDefinitionBuilder } from '../../builders/internal-root-route-definition-builder'
import { MultiRouteDefinitionProvider } from '../helpers/multi-route-definition-provider'
import { FileReaderRouteDefinitionProvider } from '../helpers/files-reader-route-definition-provider'
import { AbsoluteFilenameNormalizer } from '../../../normalizers/absolute-filename-normalizer'
import {
  INSTRUMENTATION_HOOK_FILENAME,
  MIDDLEWARE_FILENAME,
} from '../../../../../lib/constants'

export class DevInternalRootRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<InternalRootRouteDefinition> {
  public readonly kind = RouteKind.INTERNAL_ROOT

  private readonly normalizer: Normalizer
  private readonly expression: RegExp

  constructor(
    dir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(dir, reader, { recursive: false })

    this.normalizer = new AbsoluteFilenameNormalizer(dir, extensions, 'root')
    this.expression = new RegExp(
      `[/\\\\](?:${MIDDLEWARE_FILENAME}|${INSTRUMENTATION_HOOK_FILENAME})\\.(?:${extensions.join(
        '|'
      )})$`
    )
  }

  protected filterFilename(filename: string): boolean {
    return this.expression.test(filename)
  }

  public async transform(
    filenames: ReadonlyArray<string>
  ): Promise<ReadonlyArray<InternalRootRouteDefinition>> {
    // Create the builder, we'll use this to build the definitions.
    const builder = new InternalRootRouteDefinitionBuilder()

    // Loop over all the files,
    for (const filename of filenames) {
      const page = this.normalizer.normalize(filename)

      // Add the definition to the builder.
      builder.add({ page, filename })
    }

    return builder.build()
  }
}

export class DevMultiInternalRootRouteDefinitionProvider extends MultiRouteDefinitionProvider<InternalRootRouteDefinition> {
  public readonly kind = RouteKind.INTERNAL_ROOT

  constructor(
    dir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super([
      // We're looking for two files, `middleware` and `instrumentation`. Let's
      // look inside the provided directory first, and then in the `src/`
      // directory (if it exists).
      new DevInternalRootRouteDefinitionProvider(
        path.join(dir, 'src'),
        extensions,
        reader
      ),
      new DevInternalRootRouteDefinitionProvider(dir, extensions, reader),
    ])
  }
}
