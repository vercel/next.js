import type {
  Manifest,
  ManifestLoader,
} from '../helpers/manifest-loaders/manifest-loader'
import type { RouteDefinition } from '../route-definitions/route-definition'

import { DefaultRouteDefinitionProvider } from './default-route-definition-provider'

export abstract class ManifestRouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition,
  M extends Manifest = Manifest
> extends DefaultRouteDefinitionProvider<D> {
  constructor(
    /**
     * The filename of the manifest to load.
     */
    private readonly manifestFileName: string,
    /**
     * The manifest loader ot use to load the manifest.
     */
    private readonly manifestLoader: ManifestLoader<M>
  ) {
    super()
  }

  /**
   * Transforms the filenames into definitions.
   *
   * @param filenames The filenames to transform.
   */
  protected abstract transform(
    manifest: M
  ): Promise<ReadonlyArray<D>> | ReadonlyArray<D>

  protected provide(): Promise<ReadonlyArray<D>> | ReadonlyArray<D> {
    const manifest = this.manifestLoader.load(this.manifestFileName)

    // TODO: maybe throw an error if the manifest is not found?
    if (!manifest) return []

    return this.transform(manifest)
  }
}
