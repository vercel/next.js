import { routeDefinitionSorter } from '../../helpers/route-definition-sorter'
import { RouteDefinition } from '../../route-definition'
import { RouteDefinitionProvider } from '../route-definition-provider'

export abstract class MultiRouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> implements RouteDefinitionProvider<D>
{
  public abstract readonly kind: D['kind']

  constructor(
    private readonly providers: readonly RouteDefinitionProvider<D>[]
  ) {}

  protected sort(left: D, right: D): number {
    return routeDefinitionSorter(left, right)
  }

  public async provide(): Promise<ReadonlyArray<D>> {
    const definitions = await Promise.all(
      this.providers.map((provider) => provider.provide())
    )

    return definitions.flat().sort(this.sort.bind(this))
  }
}
