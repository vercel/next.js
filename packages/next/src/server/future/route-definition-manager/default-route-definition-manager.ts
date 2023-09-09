import { DetachedPromise } from '../route-definition-providers/helpers/detached-promise'
import type { RouteDefinitionProvider } from '../route-definition-providers/route-definition-provider'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteDefinitionManager } from './route-definition-manager'

export class DefaultRouteDefinitionManager implements RouteDefinitionManager {
  private readonly providers = new Array<RouteDefinitionProvider>()

  /**
   * Adds a provider to the manager.
   *
   * @param provider The provider to add.
   */
  public add<P extends RouteDefinitionProvider>(provider: P): P {
    this.providers.push(provider)
    return provider
  }

  private loaded = false
  private loading: DetachedPromise<void> = new DetachedPromise()
  public async load(): Promise<void> {
    if (this.loaded) return this.loading

    try {
      this.loaded = true
      await this.forceReload()
    } catch (err) {
      this.loading.reject(err)
    } finally {
      this.loading.resolve()
    }
  }

  private reloading = false
  private reloadingPromise: DetachedPromise<void> = new DetachedPromise()

  /**
   * Reload all the managed definition providers.
   */
  public async forceReload(): Promise<void> {
    // If a reload is already in progress, then wait for it to finish.
    if (this.reloading) return this.reloadingPromise

    this.reloading = true
    try {
      await Promise.all(this.providers.map((p) => p.reload()))
    } finally {
      // Reset the `loading` flag and resolve the promise
      this.reloading = false
      this.reloadingPromise.resolve()
    }
  }

  /**
   * Finds the definition for the given page.
   *
   * @param page The page to find the definition for.
   * @returns The definition for the page, or null if no definition was found.
   */
  public async find<D extends RouteDefinition>(
    spec: Partial<D>
  ): Promise<D | null> {
    // Loop through each provider and find the definition that matches the
    // pathname.
    for (const provider of this.providers) {
      // If the provider specifier has been added and it does not match, skip
      // it.
      if (spec.kind && provider.kind !== spec.kind) continue

      const definition = await provider.find(spec)
      if (definition) return definition as D
    }

    // Otherwise, return null.
    return null
  }
}
