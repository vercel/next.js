import type { RouteDefinitionProvider } from '../providers/route-definition-provider'
import type { RouteDefinition } from '../route-definition'
import type { RouteDefinitionManager } from './route-definition-manager'

import {
  createRouteDefinitionFilter,
  type RouteDefinitionFilterSpec,
} from '../providers/helpers/route-definition-filter'
import { BaseLoadable } from '../../helpers/loadable/base-loadable'
import { RouteKind } from '../../route-kind'

export class BaseRouteDefinitionManager
  extends BaseLoadable
  implements RouteDefinitionManager
{
  private readonly providers = new Array<RouteDefinitionProvider>()
  protected definitions: ReadonlyArray<RouteDefinition> = []

  constructor(providers: ReadonlyArray<RouteDefinitionProvider>) {
    super()

    // Validate that there are no duplicate providers for each kind.
    const seen = new Set<RouteKind>()
    for (const provider of providers) {
      if (seen.has(provider.kind)) {
        throw new Error(
          `A provider with the kind "${provider.kind}" has already been added.`
        )
      }

      this.providers.push(provider)
      seen.add(provider.kind)
    }
  }

  /**
   * Finds the definition for the given page.
   *
   * @param page The page to find the definition for.
   * @returns The definition for the page, or null if no definition was found.
   */
  public async find<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<D | null> {
    // Ensure we've loaded the definitions.
    if (!this.isLoaded) await this.load()

    for (const spec of specs) {
      const filter = createRouteDefinitionFilter<D>(spec)

      // Loop through all the definitions and find the first one that matches
      // the filter.
      const definition = this.definitions.find((d) => filter(d as D))
      if (definition) return definition as D
    }

    // Otherwise, return null.
    return null
  }

  /**
   * Returns true if a route definition exists that matches one of the given
   * specifications.
   *
   * @param specs The specifications to match.
   */
  public async has<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<boolean> {
    // Ensure we've loaded the definitions.
    if (!this.isLoaded) await this.load()

    const definition = await this.find(...specs)

    // If we found a definition, then it exists.
    return definition !== null
  }

  public with<
    K extends RouteKind,
    D extends RouteDefinition<K> = RouteDefinition<K>,
    P extends RouteDefinitionProvider<D> = RouteDefinitionProvider<D>,
    R = unknown
  >(kind: K, fn: (provider: P) => R): R | null {
    const provider = this.providers.find((p) => p.kind === kind) as P
    if (!provider) return null

    return fn(provider)
  }

  private compare(
    left: ReadonlyArray<RouteDefinition>,
    right: ReadonlyArray<RouteDefinition>
  ): boolean {
    if (left.length !== right.length) return false

    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false
    }

    return true
  }

  protected async loader(): Promise<boolean> {
    // Get all the definitions from each provider.
    let definitions:
      | ReadonlyArray<RouteDefinition>
      | ReadonlyArray<ReadonlyArray<RouteDefinition>> = await Promise.all(
      this.providers.map((p) => p.provide())
    )

    // Flatten the definitions.
    definitions = definitions.flat()

    // Determine if the definitions have changed.
    if (this.compare(this.definitions, definitions)) {
      // The definitions were the same.
      return false
    }

    // Flatten the definitions.
    this.definitions = definitions

    // The definitions were different.
    return true
  }
}
