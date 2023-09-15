import {
  isLocaleRouteDefinition,
  type LocaleRouteInfo,
} from './locale-route-info'
import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface BuiltInRouteInfo {
  /**
   * Whether the page is a built-in page or a custom page provided by the user.
   */
  builtIn: boolean
}

export type BuiltInRouteDefinition = RouteDefinition & BuiltInRouteInfo

export function isBuiltInRouteDefinition(
  definition: RouteDefinition
): definition is BuiltInRouteDefinition {
  return 'builtIn' in definition && typeof definition.builtIn === 'boolean'
}

export interface InternalAppRouteDefinition
  extends RouteDefinition<RouteKind.INTERNAL_APP>,
    BuiltInRouteInfo {}

export function isInternalAppRouteDefinition(
  definition: RouteDefinition
): definition is InternalAppRouteDefinition {
  return (
    definition.kind === RouteKind.INTERNAL_APP &&
    isBuiltInRouteDefinition(definition)
  )
}

export interface InternalPagesRouteDefinition
  extends RouteDefinition<RouteKind.INTERNAL_PAGES>,
    BuiltInRouteInfo {}

export function isInternalPagesRouteDefinition(
  definition: RouteDefinition
): definition is InternalPagesRouteDefinition {
  return (
    definition.kind === RouteKind.INTERNAL_PAGES &&
    isBuiltInRouteDefinition(definition)
  )
}

export interface InternalLocalePagesRouteDefinition
  extends RouteDefinition<RouteKind.INTERNAL_PAGES>,
    LocaleRouteInfo,
    BuiltInRouteInfo {}

export function isInternalLocalePagesRouteDefinition(
  definition: RouteDefinition
): definition is InternalLocalePagesRouteDefinition {
  return (
    isInternalPagesRouteDefinition(definition) &&
    isBuiltInRouteDefinition(definition) &&
    isLocaleRouteDefinition(definition)
  )
}

export interface InternalRootRouteDefinition
  extends RouteDefinition<RouteKind.INTERNAL_ROOT> {}
