import type { LocaleRouteDefinition } from '../route-definitions/locale-route-info'
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
