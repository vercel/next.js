import {
  isLocaleRouteDefinition,
  type LocaleRouteDefinition,
} from './locale-route-definition'
import type { RouteDefinition } from './route-definition'

import { RouteKind } from '../route-kind'

export interface BuiltInRouteDefinition<K extends RouteKind = RouteKind>
  extends RouteDefinition<K> {
  /**
   * Whether the page is a built-in page or a custom page provided by the user.
   */
  builtIn: boolean
}

export function isBuiltInRouteDefinition(
  definition: RouteDefinition
): definition is BuiltInRouteDefinition {
  return 'builtIn' in definition && typeof definition.builtIn === 'boolean'
}

export interface InternalAppRouteDefinition
  extends RouteDefinition<RouteKind.INTERNAL_APP>,
    BuiltInRouteDefinition<RouteKind.INTERNAL_APP> {}

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
    BuiltInRouteDefinition<RouteKind.INTERNAL_PAGES> {}

export function isInternalPagesRouteDefinition(
  definition: RouteDefinition
): definition is InternalPagesRouteDefinition {
  return (
    definition.kind === RouteKind.INTERNAL_PAGES &&
    isBuiltInRouteDefinition(definition)
  )
}

export interface InternalLocalePagesRouteDefinition
  extends LocaleRouteDefinition<RouteKind.INTERNAL_PAGES>,
    BuiltInRouteDefinition<RouteKind.INTERNAL_PAGES> {}

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
