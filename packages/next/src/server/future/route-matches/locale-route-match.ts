import { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import { RouteMatch } from './route-match'

export interface LocaleRouteMatch<R extends LocaleRouteDefinition>
  extends RouteMatch<R> {
  readonly detectedLocale?: string
}
