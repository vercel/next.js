import type { RouteKind } from '../route-kind'
import type { RouteDefinition } from './route-definition'

export interface LocaleRouteDefinition<K extends RouteKind = RouteKind>
  extends RouteDefinition<K> {
  /**
   * When defined it means that this route is locale aware. When undefined,
   * it means no special handling has to occur to process locales.
   */
  i18n: {
    /**
     * Describes the locale for the route. If this is undefined, then it
     * indicates that this route can handle _any_ locale.
     */
    detectedLocale: string | undefined

    /**
     * The pathname with the locale stripped if it was present.
     */
    pathname: string
  }
}

export function isLocaleRouteDefinition(
  definition: RouteDefinition
): definition is LocaleRouteDefinition {
  return (
    'i18n' in definition &&
    typeof definition.i18n === 'object' &&
    definition.i18n !== null
  )
}
