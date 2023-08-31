import type { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import type { RouteMatch } from './route-match'

export interface LocaleRouteMatch<R extends LocaleRouteDefinition>
  extends RouteMatch<R> {
  /**
   * Contains all the information about the locale for this route match.
   */
  readonly i18n: {
    /**
     * The detected locale based on the route match.
     */
    readonly detectedLocale: string | undefined

    /**
     * Whether the detected locale was inferred from the route definition as it
     * wasn't explicitly provided.
     */
    readonly inferredFromDefinition: boolean
  }
}

/**
 * Checks if the given match is a locale route match.
 *
 * @param match the match to check
 * @returns true if the match is a locale route match, false otherwise
 */
export function isLocaleRouteMatch(
  match: RouteMatch
): match is LocaleRouteMatch<LocaleRouteDefinition> {
  return 'i18n' in match
}
