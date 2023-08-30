import type { RouteMatch } from './route-match'
import type {
  AppPageInterceptingRouteDefinition,
  AppPageRouteDefinition,
} from '../route-definitions/app-page-route-definition'

import { RouteKind } from '../route-kind'

export interface AppPageRouteMatch extends RouteMatch<AppPageRouteDefinition> {}

/**
 * Checks if the given match is an App Page route match.
 * @param match the match to check
 * @returns true if the match is an App Page route match, false otherwise
 */
export function isAppPageRouteMatch(
  match: RouteMatch
): match is AppPageRouteMatch {
  return match.definition.kind === RouteKind.APP_PAGE
}

export interface AppPageInterceptingRouteMatch
  extends RouteMatch<AppPageInterceptingRouteDefinition> {}
