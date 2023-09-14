import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'

import { AppPageRouteMatcher } from '../app-page-route-matcher'
import { BaseRouteMatcherProvider } from './base-route-matcher-provider'

export class AppPageRouteMatcherProvider extends BaseRouteMatcherProvider<
  AppPageRouteDefinition,
  AppPageRouteMatcher
> {
  protected transform(
    definitions: ReadonlyArray<AppPageRouteDefinition>
  ): ReadonlyArray<AppPageRouteMatcher> {
    return definitions.map((definition) => new AppPageRouteMatcher(definition))
  }
}
