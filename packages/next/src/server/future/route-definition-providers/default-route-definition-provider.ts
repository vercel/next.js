import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteDefinitionProvider } from './route-definition-provider'

import { DetachedPromise } from './helpers/detached-promise'

function createFilter<D extends RouteDefinition>(
  spec: Partial<D>
): (d: D) => boolean {
  return (d) => {
    for (const key in spec) {
      // If the value is undefined, then skip it.
      if (typeof d[key] === 'undefined') continue

      // If the value does not match, then return false.
      if (d[key] !== spec[key]) return false
    }

    // Otherwise, return true.
    return true
  }
}

export abstract class DefaultRouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> implements RouteDefinitionProvider<D>
{
  public abstract readonly kind: D['kind']

  protected definitions: ReadonlyArray<D> = []

  public async find(spec: Partial<D>): Promise<D | null> {
    // If the definitions have not been loaded yet, then load them.
    if (!this.loaded) await this.reload()

    // Find the definition that matches the parameter.
    return this.definitions.find(createFilter(spec)) ?? null
  }

  public async filter(spec: Partial<D>): Promise<ReadonlyArray<D>> {
    // If the definitions have not been loaded yet, then load them.
    if (!this.loaded) await this.reload()

    // Find the definitions that match the pathname.
    return this.definitions.filter(createFilter(spec))
  }

  protected abstract provide(): Promise<ReadonlyArray<D>> | ReadonlyArray<D>

  protected loaded = false
  private async load(): Promise<void> {
    this.loaded = true
    this.definitions = await this.provide()
  }

  private reloading = false
  private reloadingPromise: DetachedPromise<void> = new DetachedPromise()

  public async reload(): Promise<void> {
    // If a reload is already in progress, then wait for it to finish.
    if (this.reloading) return this.reloadingPromise

    // Reset the promise.
    this.reloadingPromise = new DetachedPromise()

    // Set the `loading` flag to indicate that a reload is in progress
    this.reloading = true

    try {
      // Load the definitions.
      await this.load()
    } finally {
      // Reset the `loading` flag and resolve the promise
      this.reloading = false
      this.reloadingPromise.resolve()
    }
  }

  public async toArray(): Promise<ReadonlyArray<D>> {
    // If the definitions have not been loaded yet, then load them.
    if (!this.loaded) await this.reload()

    // Return the definitions.
    return this.definitions
  }
}
