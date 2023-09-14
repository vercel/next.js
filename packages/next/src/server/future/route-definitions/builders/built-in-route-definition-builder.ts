import type { BuiltInRouteDefinition } from '../internal-route-definition'

import { RouteDefinitionBuilder } from './route-definition-builder'

export abstract class BuiltInRouteDefinitionBuilder<
  D extends BuiltInRouteDefinition = BuiltInRouteDefinition,
  I extends Partial<D> = Partial<D>
> extends RouteDefinitionBuilder<D, I> {
  /**
   * Ensures that routes that are built in are always sorted last in the list.
   */
  protected sort(left: D, right: D): number {
    if (left.builtIn !== right.builtIn) {
      return left.builtIn ? 1 : -1
    }

    return super.sort(left, right)
  }
}
