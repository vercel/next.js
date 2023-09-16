import type { Loadable } from '../helpers/loadable/loadable'
import type { RouteComponents } from '../route-components-loader/route-components-loader'
import type { RouteDefinitionFilterSpec } from '../route-definitions/providers/helpers/route-definition-filter'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { MatchOptions } from '../route-matchers/managers/route-matcher-manager'
import type { RouteMatch } from '../route-matches/route-match'

export interface RouteManager extends Loadable {
  /**
   * Finds the first route definition that matches the given specification.
   */
  findDefinition<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): PromiseLike<D | null> | D | null

  /**
   * Returns true if a route definition exists that matches one of the given
   * specifications.
   *
   * @param specs The specification to match.
   */
  hasDefinition<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): PromiseLike<boolean> | boolean

  /**
   * Loads the components for the given route definition.
   *
   * @param definition the route definition to load components for
   */
  loadComponents(
    definition: RouteDefinition
  ): PromiseLike<RouteComponents | null> | RouteComponents | null

  /**
   * Finds the first route definition that matches the given specification.
   *
   * @param pathname the pathname to match
   * @param options the match options
   * @returns a promise that resolves to the first route match or `null` if no
   * route matches the given pathname and options
   */
  match(
    pathname: string,
    options: MatchOptions
  ): PromiseLike<RouteMatch | null> | RouteMatch | null

  /**
   * Finds all route definitions that match the given specification.
   */
  matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch, void, void>
}
