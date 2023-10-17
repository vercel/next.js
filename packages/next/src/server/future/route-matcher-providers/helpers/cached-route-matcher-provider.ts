import type { RouteMatcherProvider } from '../route-matcher-provider'
import type { RouteMatcher } from '../../route-matchers/route-matcher'

interface LoaderComparable<D> {
  load(): Promise<D>
  compare(left: D, right: D): boolean
}

/**
 * This will memoize the matchers if the loaded data is comparable.
 */
export abstract class CachedRouteMatcherProvider<
  M extends RouteMatcher = RouteMatcher,
  D = any
> implements RouteMatcherProvider<M>
{
  private data?: D
  private cached: ReadonlyArray<M> = []

  constructor(private readonly loader: LoaderComparable<D>) {}

  protected abstract transform(data: D): Promise<ReadonlyArray<M>>

  public async matchers(): Promise<readonly M[]> {
    const data = await this.loader.load()
    if (!data) return []

    // Return the cached matchers if the data has not changed.
    if (this.data && this.loader.compare(this.data, data)) return this.cached
    this.data = data

    // Transform the manifest into matchers.
    const matchers = await this.transform(data)

    // Cache the matchers.
    this.cached = matchers

    return matchers
  }
}
