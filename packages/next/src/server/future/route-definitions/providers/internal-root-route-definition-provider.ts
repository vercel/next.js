import type { InternalRootRouteDefinition } from '../internal-route-definition'
import type { MiddlewareManifest } from '../../../../build/webpack/plugins/middleware-plugin'
import type { FileReader } from '../../helpers/file-reader/file-reader'
import type { ManifestLoader } from '../../manifests/loaders/manifest-loader'
import type { MiddlewareManifests } from '../../manifests/manifests'

import path from 'path'
import {
  MIDDLEWARE_MANIFEST,
  SERVER_DIRECTORY,
} from '../../../../shared/lib/constants'
import { RouteKind } from '../../route-kind'
import { InternalRootRouteDefinitionBuilder } from '../builders/internal-root-route-definition-builder'
import { FileReaderRouteDefinitionProvider } from './helpers/files-reader-route-definition-provider'
import { ManifestRouteDefinitionProvider } from './helpers/manifest-route-definition-provider'
import { MultiRouteDefinitionProvider } from './helpers/multi-route-definition-provider'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../../../lib/constants'

export class InternalRootMiddlewareRouteDefinitionProvider extends ManifestRouteDefinitionProvider<
  InternalRootRouteDefinition,
  MiddlewareManifests
> {
  public readonly kind = RouteKind.INTERNAL_ROOT

  constructor(manifestLoader: ManifestLoader<MiddlewareManifests>) {
    super(MIDDLEWARE_MANIFEST, manifestLoader)
  }

  protected transform(
    manifest: MiddlewareManifest
  ): ReadonlyArray<InternalRootRouteDefinition> {
    const middleware = manifest.middleware?.['/']
    if (!middleware) return []

    const builder = new InternalRootRouteDefinitionBuilder()

    builder.add({
      page: '/middleware',
      filename: middleware.files[middleware.files.length - 1],
    })

    return builder.build()
  }
}

export class InternalRootInstrumentationRouteDefinitionProvider extends FileReaderRouteDefinitionProvider<InternalRootRouteDefinition> {
  public readonly kind = RouteKind.INTERNAL_ROOT

  constructor(distDir: string, fileReader: FileReader) {
    super(path.join(distDir, SERVER_DIRECTORY), fileReader, {
      recursive: false,
    })
  }

  protected filterFilename(filename: string): boolean {
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)

    if (base !== INSTRUMENTATION_HOOK_FILENAME) return false

    return true
  }

  protected transform(
    filenames: ReadonlyArray<string>
  ): ReadonlyArray<InternalRootRouteDefinition> | null {
    if (filenames.length === 0) return null

    if (filenames.length > 1) {
      throw new Error(
        `Found more than one instrumentation hook file: ${filenames.join(', ')}`
      )
    }

    const filename = filenames[0]

    const builder = new InternalRootRouteDefinitionBuilder()

    builder.add({ page: '/instrumentation', filename })

    return builder.build()
  }
}

export class InternalRootRouteDefinitionProvider extends MultiRouteDefinitionProvider {
  public readonly kind = RouteKind.INTERNAL_ROOT

  constructor(
    distDir: string,
    fileReader: FileReader,
    manifestLoader: ManifestLoader<MiddlewareManifests>
  ) {
    super([
      new InternalRootMiddlewareRouteDefinitionProvider(manifestLoader),
      new InternalRootInstrumentationRouteDefinitionProvider(
        distDir,
        fileReader
      ),
    ])
  }
}
