import { RouteKind } from '../route-kind'

export interface RouteDefinition<K extends RouteKind = RouteKind> {
  readonly kind: K
  readonly bundlePath: string
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

  /**
   * The pathname (including dynamic placeholders) for a route to resolve that
   * is used for the browser to display in the address bar. This is used in
   * place of `pathname` when the route is rendering.
   */
  readonly pathnameOverride?: string
}
