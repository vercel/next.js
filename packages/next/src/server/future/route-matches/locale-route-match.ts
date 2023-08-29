import type { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import type { RouteMatch } from './route-match'

export interface LocaleRouteMatch<R extends LocaleRouteDefinition>
  extends RouteMatch<R> {
  readonly supportsLocales: true
  readonly detectedLocale?: string
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
  return 'supportsLocales' in match && match.supportsLocales === true
}
