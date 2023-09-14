import type { RouteDefinition } from '../route-definition'

import { routeDefinitionSorter } from '../helpers/route-definition-sorter'

export abstract class RouteDefinitionBuilder<
  D extends RouteDefinition = RouteDefinition,
  I extends Partial<D> = Partial<D>
> {
  protected readonly definitions = new Array<D>()

  /**
   * Add a new route definition to the builder.
   *
   * @param input The input to use to create the definition.
   */
  public abstract add(input: I): void

  protected sort(left: D, right: D): number {
    return routeDefinitionSorter(left, right)
  }

  /**
   * Build the definitions that have been added to the builder and return a
   * sorted array of them. First sorted by pathname, then by page.
   *
   * @returns A read-only array of the definitions that have been added to the
   * builder.
   */
  public build(): ReadonlyArray<D> {
    return this.definitions.sort(this.sort.bind(this))
  }
}
