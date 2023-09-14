export interface Loadable {
  /**
   * Load the underlying data. This will only load the data once, subsequent
   * calls will return the same promise.
   *
   * True indicates that the data was updated, false indicates that the data
   * was not updated.
   */
  load(): Promise<boolean | void>

  /**
   * Forces a reload of the data, even if it has already been loaded.
   */
  forceReload(): Promise<void>

  /**
   * Marks the data as stale, so that the next time `load` is called, it will
   * reload the data.
   */
  invalidate(): void
}
