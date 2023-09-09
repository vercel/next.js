import type { RouteDefinition } from '../route-definitions/route-definition'

import { RouteMatcher } from '../route-matchers/route-matcher'

export interface RouteMatcherProvider<
  D extends RouteDefinition = RouteDefinition,
  M extends RouteMatcher<D> = RouteMatcher<D>
> {
  /**
   * Returns the matchers for this route definition.
   */
  provide(): Promise<ReadonlyArray<M>>
}
