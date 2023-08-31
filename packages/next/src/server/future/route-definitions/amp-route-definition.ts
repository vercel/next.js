import type { RouteKind } from '../route-kind'
import type { RouteDefinition } from './route-definition'

export interface AMPRouteDefinition<K extends RouteKind = RouteKind>
  extends RouteDefinition<K> {
  /**
   * The AMP variant of this page if it exists. If this page is the AMP variant,
   * then this will be undefined.
   */
  amp?: AMPRouteDefinition<K>
}

export function isAMPRouteDefinition(
  definition: RouteDefinition
): definition is AMPRouteDefinition {
  return 'amp' in definition
}
