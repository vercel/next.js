import type { RouteKind } from '../route-kind'
import type { RouteDefinition } from './route-definition'

export interface AppPageNativeRscRuntimeRouteDefinition
  extends RouteDefinition<RouteKind.APP_PAGE_NATIVE_RSC_RUNTIME> {
  readonly appPaths: ReadonlyArray<string>
}
