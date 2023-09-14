/**
 * Provider interface for providing data.
 */
export interface Provider<D> {
  /**
   * Provides the data to be used.
   */
  provide(): PromiseLike<D> | D
}
