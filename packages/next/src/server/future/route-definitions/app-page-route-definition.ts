import { RouteKind } from '../route-kind'
import { RouteDefinition } from './route-definition'

export interface AppPageRouteDefinition
  extends RouteDefinition<RouteKind.APP_PAGE> {
  readonly appPaths: ReadonlyArray<string>
}
