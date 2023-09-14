import type { LoadComponentsReturnType } from '../../load-components'
import type { RouteDefinition } from '../route-definitions/route-definition'

export type RouteComponents = LoadComponentsReturnType

export interface RouteComponentsLoader {
  load(definition: RouteDefinition): Promise<RouteComponents | null>
}
