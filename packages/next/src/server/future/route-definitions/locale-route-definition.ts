import type { RouteDefinition } from './route-definition'
import type { RouteKind } from '../route-kind'

export interface LocaleRouteDefinition<K extends RouteKind = RouteKind>
  extends RouteDefinition<K> {
  /**
   * When defined it means that this route is locale aware. When undefined,
   * it means no special handling has to occur to process locales.
   */
  i18n?: {
    /**
     * Describes the locale for the route. If this is undefined, then it
     * indicates that this route can handle _any_ locale.
     */
    locale?: string
  }
}
