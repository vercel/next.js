import type { LocaleRouteIdentity } from '../route-definitions/locale-route-definition'
import type { RouteMatch } from './route-match'

export interface LocaleRouteMatch<R extends LocaleRouteIdentity>
  extends RouteMatch<R> {
  readonly detectedLocale?: string
}
