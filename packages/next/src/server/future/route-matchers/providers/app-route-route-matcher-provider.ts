import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'

import { AppRouteRouteMatcher } from '../app-route-route-matcher'
import { BaseRouteMatcherProvider } from './base-route-matcher-provider'

export class AppRouteRouteMatcherProvider extends BaseRouteMatcherProvider<
  AppRouteRouteDefinition,
  AppRouteRouteMatcher
> {
  protected transform(
    definitions: ReadonlyArray<AppRouteRouteDefinition>
  ): ReadonlyArray<AppRouteRouteMatcher> {
    return definitions.map((definition) => new AppRouteRouteMatcher(definition))
  }
}
