import type { Provider } from '../../helpers/provider'
import type { RouteDefinition } from '../route-definition'

export interface RouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> extends Provider<ReadonlyArray<D>> {
  readonly kind: D['kind']
}
