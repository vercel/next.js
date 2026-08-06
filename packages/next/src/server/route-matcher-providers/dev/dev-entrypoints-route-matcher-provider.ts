import type { RouteMatcherProvider } from '../route-matcher-provider'
import type { RouteMatcher } from '../../route-matchers/route-matcher'
import type { RouteDefinition } from '../../route-definitions/route-definition'
import type { AppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'
import type { AppRouteRouteDefinition } from '../../route-definitions/app-route-route-definition'
import type { PagesRouteDefinition } from '../../route-definitions/pages-route-definition'
import type { PagesAPIRouteDefinition } from '../../route-definitions/pages-api-route-definition'
import { RouteKind } from '../../route-kind'
import { AppPageRouteMatcher } from '../../route-matchers/app-page-route-matcher'
import { AppRouteRouteMatcher } from '../../route-matchers/app-route-route-matcher'
import {
  PagesRouteMatcher,
  PagesLocaleRouteMatcher,
} from '../../route-matchers/pages-route-matcher'
import {
  PagesAPIRouteMatcher,
  PagesAPILocaleRouteMatcher,
} from '../../route-matchers/pages-api-route-matcher'

/**
 * Serves route matchers from the route definitions the bundler derived from
 * its compiled entrypoints, instead of scanning the filesystem. The
 * definitions are pushed on every entrypoints update and pulled on demand
 * when a request path doesn't match.
 */
export class DevEntrypointsRouteMatcherProvider
  implements RouteMatcherProvider
{
  constructor(
    private readonly getDefinitions: () =>
      | ReadonlyArray<RouteDefinition>
      | undefined,
    private readonly localeAware: boolean
  ) {}

  async matchers(): Promise<ReadonlyArray<RouteMatcher>> {
    const definitions = this.getDefinitions() ?? []
    const matchers: Array<RouteMatcher> = []

    for (const definition of definitions) {
      switch (definition.kind) {
        case RouteKind.APP_PAGE:
          matchers.push(
            new AppPageRouteMatcher(definition as AppPageRouteDefinition)
          )
          break
        case RouteKind.APP_ROUTE:
          matchers.push(
            new AppRouteRouteMatcher(definition as AppRouteRouteDefinition)
          )
          break
        case RouteKind.PAGES:
          matchers.push(
            this.localeAware
              ? new PagesLocaleRouteMatcher(definition as PagesRouteDefinition)
              : new PagesRouteMatcher(definition as PagesRouteDefinition)
          )
          break
        case RouteKind.PAGES_API:
          matchers.push(
            this.localeAware
              ? new PagesAPILocaleRouteMatcher(
                  definition as PagesAPIRouteDefinition
                )
              : new PagesAPIRouteMatcher(definition as PagesAPIRouteDefinition)
          )
          break
        default:
          break
      }
    }

    return matchers
  }
}
