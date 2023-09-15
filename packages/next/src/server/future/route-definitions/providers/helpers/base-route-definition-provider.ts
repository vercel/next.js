import type { RouteDefinition } from '../../route-definition'
import type { RouteDefinitionProvider } from '../route-definition-provider'

import { MemoizedTransformerProvider } from '../../../helpers/memoized-transformer'

export abstract class BaseRouteDefinitionProvider<
    D extends RouteDefinition = RouteDefinition,
    Data = unknown
  >
  extends MemoizedTransformerProvider<Data, ReadonlyArray<D>>
  implements RouteDefinitionProvider<D>
{
  public abstract readonly kind: D['kind']

  public async provide(): Promise<ReadonlyArray<D>> {
    const definitions = await super.provide()
    if (!definitions) return []

    return definitions
  }
}
