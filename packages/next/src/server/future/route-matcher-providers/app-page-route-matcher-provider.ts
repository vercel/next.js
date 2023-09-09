import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'

import { AppPageRouteMatcher } from '../route-matchers/app-page-route-matcher'
import { DefaultRouteMatcherProvider } from './default-route-matcher-provider'

export class AppPageRouteMatcherProvider extends DefaultRouteMatcherProvider<
  AppPageRouteDefinition,
  AppPageRouteMatcher
> {
  protected transform(definition: AppPageRouteDefinition): AppPageRouteMatcher {
    return new AppPageRouteMatcher(definition)
  }
}
