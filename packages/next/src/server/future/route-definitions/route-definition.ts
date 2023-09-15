import { RouteKind } from '../route-kind'

export interface RouteDefinition<K extends RouteKind = RouteKind> {
  /**
   * The kind of route this is.
   */
  readonly kind: K

  /**
   * In development this represents the bundlePath representation of the given
   * route.
   *
   * TODO: look into deprecating this, it should be replaced by `kind` and `page`
   */
  readonly bundlePath: string

  /**
   * In development, this represents the absolute path to the source file while
   * in production this represents the path to the built file.
   */
  readonly filename: string

  /**
   * Describes the pathname including all internal modifiers such as
   * intercepting routes, parallel routes and route/page suffixes that are not
   * part of the pathname.
   */
  readonly page: string

  /**
   * The pathname (including dynamic placeholders) for a route to resolve.
   */
  readonly pathname: string
}

export function isRouteDefinition(
  definition: object
): definition is RouteDefinition {
  return (
    'kind' in definition &&
    typeof definition.kind === 'string' &&
    'bundlePath' in definition &&
    typeof definition.bundlePath === 'string' &&
    'filename' in definition &&
    typeof definition.filename === 'string' &&
    'page' in definition &&
    typeof definition.page === 'string' &&
    'pathname' in definition &&
    typeof definition.pathname === 'string'
  )
}

/**
 * In development, the definitions emitted by the route definition managers
 * will be wrapped in this interface to provide additional information about
 * the development route.
 */
export interface DevRouteInfo<K extends RouteKind = RouteKind> {
  /**
   * The development route definition associated with this route definition.
   */
  development: RouteDefinition<K>
}

export function isDevRouteDefinition(
  definition: RouteDefinition
): definition is RouteDefinition & DevRouteInfo {
  return (
    'development' in definition &&
    typeof definition.development === 'object' &&
    definition.development !== null &&
    isRouteDefinition(definition.development)
  )
}
