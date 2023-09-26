import { RouteMatcher } from '../../route-matchers/route-matcher'
import { RouteMatcherProvider } from '../route-matcher-provider'

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

  /**
   * Load the data to be transformed into matchers.
   */
  protected abstract load(): Promise<D>

  /**
   * Compare the loaded data to the previous data.
   */
  protected abstract compare(left: D, right: D): boolean

  /**
   * Transform the loaded data into matchers.
   *
   * @param data The loaded data.
   */
  protected abstract transform(data: D): Promise<ReadonlyArray<M>>

  public async matchers(): Promise<readonly M[]> {
    const data = await this.load()
    if (!data) return []

    // Return the cached matchers if the data has not changed.
    if (this.data && this.compare(this.data, data)) return this.cached
    this.data = data

    // Transform the manifest into matchers.
    const matchers = await this.transform(data)

    // Cache the matchers.
    this.cached = matchers

    return matchers
  }
}
