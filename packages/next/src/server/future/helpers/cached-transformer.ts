import { Provider } from './provider'

export abstract class CachedTransformerProvider<D, T>
  implements Provider<T | null>
{
  private cached?: D
  private transformed?: T

  /**
   * Load the data to be compared and possibly transformed. This will be cached
   * and compared to the next load.
   */
  protected abstract load(): PromiseLike<D | null> | D | null

  /**
   * Compares the left and right data. If they are completely equal (same) then
   * `true` is returned, otherwise `false`. If this returns `true` then the
   * cached transformed data will be returned (if it exists).
   */
  protected abstract compare(left: D, right: D): boolean

  /**
   * Transforms the data into the desired type, this is only called if the data
   * has changed or the transformed data has not been cached yet.
   */
  protected abstract transform(data: D): PromiseLike<T | null> | T | null

  /**
   * Provides the transformed data. This may be cached if the data has not
   * changed.
   */
  public async provide(): Promise<T | null> {
    // Try to load the data
    const data = await this.load()
    if (!data) return null

    // If the data is cached and the data has not changed, return the cached
    // transformed data.
    if (this.cached && this.transformed && this.compare(this.cached, data)) {
      return this.transformed
    }

    // Otherwise, transform the data and cache it.
    const transformed = await this.transform(data)
    if (!transformed) return null

    this.cached = data
    this.transformed = transformed

    return transformed
  }
}
