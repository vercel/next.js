import { RouteDefinition } from './route-definition'

export interface LocaleRouteInfo {
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

export type LocaleRouteDefinition = RouteDefinition & LocaleRouteInfo

export function isLocaleRouteInfo(info: object): info is LocaleRouteDefinition {
  return (
    'i18n' in info &&
    typeof info.i18n === 'object' &&
    info.i18n !== null &&
    'detectedLocale' in info.i18n &&
    (typeof info.i18n.detectedLocale === 'string' ||
      typeof info.i18n.detectedLocale === 'undefined') &&
    'pathname' in info.i18n &&
    typeof info.i18n.pathname === 'string'
  )
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
