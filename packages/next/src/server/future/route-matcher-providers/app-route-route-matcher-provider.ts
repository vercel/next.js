import type { AppRouteRouteDefinition } from '../route-definitions/app-route-route-definition'

import { AppRouteRouteMatcher } from '../route-matchers/app-route-route-matcher'
import { DefaultRouteMatcherProvider } from './default-route-matcher-provider'

export class AppRouteRouteMatcherProvider extends DefaultRouteMatcherProvider<
  AppRouteRouteDefinition,
  AppRouteRouteMatcher
> {
  protected transform(
    definition: AppRouteRouteDefinition
  ): AppRouteRouteMatcher {
    return new AppRouteRouteMatcher(definition)
  }
}
