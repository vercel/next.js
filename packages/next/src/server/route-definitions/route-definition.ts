import type { RouteKind } from '../route-kind'

/**
 * Identifies a route for request matching and compilation. Turbopack resolves
 * source files itself, so a request does not need a source filename.
 */
export interface RouteIdentity<K extends RouteKind = RouteKind> {
  readonly kind: K
  readonly bundlePath: string
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

/**
 * A route whose source or compiled file is needed by its consumer.
 */
export interface RouteDefinition<K extends RouteKind = RouteKind>
  extends RouteIdentity<K> {
  readonly filename: string
}

export function hasRouteFilename<D extends RouteIdentity>(
  definition: D
): definition is D & RouteDefinition {
  return 'filename' in definition && typeof definition.filename === 'string'
}
