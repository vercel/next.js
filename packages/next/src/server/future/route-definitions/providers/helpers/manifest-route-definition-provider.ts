import { ManifestsLoader } from '../../helpers/manifest-loaders/manifest-loader'
import type { RouteDefinition } from '../../route-definition'

import { BaseRouteDefinitionProvider } from './base-route-definition-provider'

export abstract class ManifestRouteDefinitionProvider<
  D extends RouteDefinition,
  K extends string,
  M
> extends BaseRouteDefinitionProvider<D, M> {
  constructor(
    /**
     * The filename of the manifest to load.
     */
    private readonly manifestFileName: K,
    /**
     * The manifest loader ot use to load the manifest.
     */
    private readonly manifestLoader: ManifestsLoader<{
      [N in K]: M
    }>
  ) {
    super()
  }

  /**
   * Compares the left and right manifests. If they are completely equal (same)
   * then `true` is returned, otherwise `false`.
   */
  protected compare(left: M, right: M): boolean {
    return left === right
  }

  /**
   * Loads the manifest from the loader.
   */
  protected load(): M | null {
    return this.manifestLoader.load(this.manifestFileName)
  }

  /**
   * Transforms the filenames into definitions.
   *
   * @param filenames The filenames to transform.
   */
  protected abstract transform(
    manifest: M
  ): Promise<ReadonlyArray<D>> | ReadonlyArray<D>
}
