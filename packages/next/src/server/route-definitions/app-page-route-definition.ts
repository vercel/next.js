import type { RouteDefinition } from './route-definition'
import { RouteKind } from '../route-kind'

export interface AppPageRouteDefinition
  extends RouteDefinition<RouteKind.APP_PAGE> {
  readonly appPaths: ReadonlyArray<string>
}

/**
 * Returns true if the given definition is an App Page route definition.
 */
export function isAppPageRouteDefinition(
  definition: RouteDefinition
): definition is AppPageRouteDefinition {
  return definition.kind === RouteKind.APP_PAGE
}
