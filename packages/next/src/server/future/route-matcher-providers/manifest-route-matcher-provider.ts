import { RouteMatcher } from '../route-matchers/route-matcher'
import { RouteMatcherProvider } from './route-matcher-provider'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'

export abstract class ManifestRouteMatcherProvider<
  M extends RouteMatcher = RouteMatcher
> implements RouteMatcherProvider<M>
{
  private manifest?: Manifest
  private cached: ReadonlyArray<M> = []

  constructor(
    private readonly manifestName: string,
    private readonly manifestLoader: ManifestLoader
  ) {}

  protected abstract transform(manifest: Manifest): Promise<ReadonlyArray<M>>

  public async matchers(): Promise<readonly M[]> {
    const manifest = this.manifestLoader.load(this.manifestName)
    if (!manifest) return []

    // Return the cached matchers if the manifest has not changed. The Manifest
    // loader under the hood uses the `require` API, which has it's own cache.
    // In production, this will always return the same value, in development,
    // the cache is invalidated when the manifest is updated.
    if (this.manifest === manifest) return this.cached
    this.manifest = manifest

    // Transform the manifest into matchers.
    const matchers = await this.transform(manifest)

    // Cache the matchers.
    this.cached = matchers

    return matchers
  }
}
