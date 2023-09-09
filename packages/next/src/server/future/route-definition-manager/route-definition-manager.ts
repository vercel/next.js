import type { RouteDefinitionProvider } from '../route-definition-providers/route-definition-provider'
import type { RouteDefinition } from '../route-definitions/route-definition'

export interface RouteDefinitionManager {
  add<P extends RouteDefinitionProvider>(provider: P): P
  find<D extends RouteDefinition>(spec: Partial<D>): Promise<D | null>
  load(): Promise<void>
  forceReload(): Promise<void>
}
