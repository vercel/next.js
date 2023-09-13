import { RouteMatcher } from '../route-matchers/route-matcher'
import {
  Manifest,
  ManifestLoader,
} from './helpers/manifest-loaders/manifest-loader'
import { CachedRouteMatcherProvider } from './helpers/cached-route-matcher-provider'

export abstract class ManifestRouteMatcherProvider<
  M extends RouteMatcher = RouteMatcher
> extends CachedRouteMatcherProvider<M, Manifest | null> {
  constructor(
    private readonly manifestName: string,
    private readonly manifestLoader: ManifestLoader
  ) {
    super()
  }

  protected async load() {
    return this.manifestLoader.load(this.manifestName)
  }

  protected compare(left: Manifest | null, right: Manifest | null): boolean {
    return left === right
  }
}
