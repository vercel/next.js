import type { RouteDefinitionProvider } from '../route-definition-providers/route-definition-provider'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteMatcherProvider } from './route-matcher-provider'

import { RouteMatcher } from '../route-matchers/route-matcher'

export abstract class DefaultRouteMatcherProvider<
  D extends RouteDefinition = RouteDefinition,
  M extends RouteMatcher<D> = RouteMatcher<D>
> implements RouteMatcherProvider<D, M>
{
  constructor(
    /**
     * The provider that provides the route definitions.
     */
    private readonly definitions: RouteDefinitionProvider<D>
  ) {}

  /**
   * Transforms a route definition into a route matcher.
   *
   * @param definition the definition to transform into a matcher
   */
  protected abstract transform(definition: D): M

  /**
   * Returns the matchers for this route definition.
   */
  public async provide(): Promise<ReadonlyArray<M>> {
    // Get the definitions.
    const definitions = await this.definitions.toArray()

    // For each definition, create a matcher.
    return definitions.map((definition) => this.transform(definition))
  }
}
