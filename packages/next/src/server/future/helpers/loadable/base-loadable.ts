import { Debuggable } from '../debuggable'
import { DetachedPromise } from '../detached-promise'
import { Loadable } from './loadable'

export abstract class BaseLoadable extends Debuggable implements Loadable {
  private loaded = false

  protected get isLoaded(): boolean {
    return this.loaded
  }

  /**
   * The loader that will be called when the data needs to be loaded.
   */
  protected abstract loader(isForceReload: boolean): Promise<boolean | void>

  private reloadingPromise?: DetachedPromise<boolean>

  /**
   * Reload the underlying data. This also ensures that multiple concurrent
   * reloads are not started.
   *
   * @returns A promise that resolves when the data has been reloaded.
   */
  private async reload(isForceReload: boolean): Promise<boolean> {
    this.debug('reloading (forced %s)', isForceReload ? 'yes' : 'no')

    // If a reload is already in progress, then wait for it to finish.
    if (this.reloadingPromise) return this.reloadingPromise

    // Otherwise, create a new promise that will be resolved or rejected when
    // the loader is done.
    this.reloadingPromise = new DetachedPromise()

    // Set the loaded flag to true so that the next time `load` is called it
    // will not reload.
    this.loaded = true

    try {
      // Call the loader.
      const result = await this.loader(isForceReload)

      const updated = typeof result === 'boolean' ? result : true

      // Resolve the promise, letting any pending `reload` calls know that the
      // data has been reloaded.
      this.reloadingPromise.resolve(updated)

      return updated
    } catch (err) {
      // Reject the promise, letting any pending `reload` calls know that the
      // data failed to reload.
      this.reloadingPromise.reject(err)
      return false
    } finally {
      // Reset the `reloadingPromise` so that the next `reload` call can start.
      this.reloadingPromise = undefined
    }
  }

  /**
   * Loads the underlying data. This will only ever be done once unless reset.
   *
   * @returns A promise that resolves when the data has been loaded.
   */
  public async load(): Promise<boolean> {
    // Ensure that loading is only ever done once or that it is done again if
    // a provider was added.
    if (this.loaded) {
      if (this.reloadingPromise) return this.reloadingPromise

      return false
    }

    this.loaded = true

    return this.reload(false)
  }

  /**
   * Marks the data as stale, so that the next time `load` is called, it will
   * reload the data.
   */
  public invalidate(): void {
    this.loaded = false
  }

  /**
   * Forces a reload of the data, even if it has already been loaded.
   *
   * @returns A promise that resolves when the data has been reloaded.
   */
  public async forceReload(): Promise<void> {
    await this.reload(true)
  }
}
