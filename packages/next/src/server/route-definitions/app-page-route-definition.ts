import type { RouteDefinition, RouteIdentity } from './route-definition'
import { RouteKind } from '../route-kind'

export interface AppPageRouteIdentity
  extends RouteIdentity<RouteKind.APP_PAGE> {
  readonly appPaths: ReadonlyArray<string>
}

export interface AppPageRouteDefinition
  extends RouteDefinition<RouteKind.APP_PAGE>,
    AppPageRouteIdentity {}

/**
 * Returns true if the given definition is an App Page route definition.
 */
export function isAppPageRouteDefinition<D extends RouteIdentity>(
  definition: D
): definition is D & AppPageRouteIdentity {
  return definition.kind === RouteKind.APP_PAGE
}
