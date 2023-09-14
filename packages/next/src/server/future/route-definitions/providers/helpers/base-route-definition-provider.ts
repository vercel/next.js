import type { RouteDefinition } from '../../route-definition'
import type { RouteDefinitionProvider } from '../route-definition-provider'

import { CachedTransformerProvider } from '../../../helpers/cached-transformer'

export abstract class BaseRouteDefinitionProvider<
    D extends RouteDefinition = RouteDefinition,
    Data = unknown
  >
  extends CachedTransformerProvider<Data, ReadonlyArray<D>>
  implements RouteDefinitionProvider<D>
{
  public abstract readonly kind: D['kind']

  public async provide(): Promise<ReadonlyArray<D>> {
    const definitions = await super.provide()
    if (!definitions) return []

    return definitions
  }
}
