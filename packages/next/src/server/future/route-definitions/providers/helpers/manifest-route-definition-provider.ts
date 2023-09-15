import type { ManifestLoader } from '../../../manifests/loaders/manifest-loader'
import type { ManifestKey, Manifests } from '../../../manifests/manifests'
import type { RouteDefinition } from '../../route-definition'

import { BaseRouteDefinitionProvider } from './base-route-definition-provider'

export abstract class ManifestRouteDefinitionProvider<
  D extends RouteDefinition,
  M extends Partial<Manifests>
> extends BaseRouteDefinitionProvider<D, M[ManifestKey<M>]> {
  constructor(
    /**
     * The filename of the manifest to load.
     */
    private readonly manifestFileName: ManifestKey<M>,
    /**
     * The manifest loader ot use to load the manifest.
     */
    private readonly manifestLoader: ManifestLoader<M>
  ) {
    super()
  }

  /**
   * Compares the left and right manifests. If they are completely equal (same)
   * then `true` is returned, otherwise `false`.
   */
  protected compare(
    left: M[ManifestKey<M>],
    right: M[ManifestKey<M>]
  ): boolean {
    return left === right
  }

  /**
   * Loads the manifest from the loader.
   */
  protected load():
    | PromiseLike<M[ManifestKey<M>] | null>
    | M[ManifestKey<M>]
    | null {
    return this.manifestLoader.load(this.manifestFileName)
  }

  /**
   * Transforms the filenames into definitions.
   *
   * @param filenames The filenames to transform.
   */
  protected abstract transform(
    manifest: M[ManifestKey<M>]
  ): Promise<ReadonlyArray<D>> | ReadonlyArray<D>
}
