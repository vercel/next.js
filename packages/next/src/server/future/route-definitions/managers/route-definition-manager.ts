import type { Loadable } from '../../helpers/loadable/loadable'
import type { RouteDefinitionProvider } from '../providers/route-definition-provider'
import type { RouteDefinitionFilterSpec } from '../providers/helpers/route-definition-filter'
import type { RouteDefinition } from '../route-definition'
import type { RouteKind } from '../../route-kind'

export interface RouteDefinitionManager extends Loadable {
  /**
   * Finds a route definition that matches the given specification.
   *
   * @param spec The specification to match.
   */
  find<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<D | null>

  /**
   * Finds a route definition provider that matches the given specification and
   * calls the given function with the provider. If no provider is found, then
   * null is returned.
   *
   * @param kind the kind of provider to find.
   * @param fn The function to call with the provider.
   */
  with<
    K extends RouteKind,
    D extends RouteDefinition<K> = RouteDefinition<K>,
    P extends RouteDefinitionProvider<D> = RouteDefinitionProvider<D>,
    R = unknown
  >(
    kind: K,
    fn: (provider: P) => R
  ): R | null
}
