import type { AppPageRouteDefinition } from '../../../route-definitions/app-page-route-definition'
import type { AppRouteRouteDefinition } from '../../../route-definitions/app-route-route-definition'
import type { RouteMatcherManager } from '../route-matcher-manager'
import type { RouteDefinitionManager } from '../../../route-definitions/managers/route-definition-manager'

import { AppPageRouteMatcherProvider } from '../../providers/app-page-route-matcher-provider'
import { AppRouteRouteMatcherProvider } from '../../providers/app-route-route-matcher-provider'
import { PagesAPIRouteMatcherProvider } from '../../providers/pages-api-route-matcher-provider'
import { PagesRouteMatcherProvider } from '../../providers/pages-route-matcher-provider'
import { BaseRouteMatcherManager } from '../base-route-matcher-manager'
import { RouteKind } from '../../../route-kind'

export class NextRouteMatcherBuilder {
  public static build(
    definitions: RouteDefinitionManager
  ): RouteMatcherManager {
    const matchers = new BaseRouteMatcherManager()

    // Add support for pages in the `pages/` directory.
    definitions.with(RouteKind.PAGES, (provider) => {
      matchers.add(new PagesRouteMatcherProvider(provider))
    })

    // Add support for API routes in the `pages/api/` directory.
    definitions.with(RouteKind.PAGES_API, (provider) => {
      matchers.add(new PagesAPIRouteMatcherProvider(provider))
    })

    // Match app pages under `app/`.
    definitions.with<RouteKind.APP_PAGE, AppPageRouteDefinition>(
      RouteKind.APP_PAGE,
      (provider) => {
        matchers.add(new AppPageRouteMatcherProvider(provider))
      }
    )

    // Match app routes under `app/`.
    definitions.with<RouteKind.APP_ROUTE, AppRouteRouteDefinition>(
      RouteKind.APP_ROUTE,
      (provider) => {
        matchers.add(new AppRouteRouteMatcherProvider(provider))
      }
    )

    return matchers
  }
}
