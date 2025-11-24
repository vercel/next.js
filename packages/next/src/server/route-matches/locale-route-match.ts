import type { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import type { RouteMatch } from './route-match'

export interface LocaleRouteMatch<R extends LocaleRouteDefinition>
  extends RouteMatch<R> {
  readonly detectedLocale?: string
}
