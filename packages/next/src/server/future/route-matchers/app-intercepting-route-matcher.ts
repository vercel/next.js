import type { AppPageInterceptingRouteDefinition } from '../route-definitions/app-page-route-definition'
import type { AppPageInterceptingRouteMatch } from '../route-matches/app-page-route-match'
import { RouteMatcher } from './route-matcher'

export type AppPageInterceptingRouteMatcherMatchOptions = {
  /**
   * If provided, this is used for intercepting routes to resolve.
   */
  referrer?: string
}

export class AppPageInterceptingRouteMatcher extends RouteMatcher<AppPageInterceptingRouteDefinition> {
  private readonly interceptingRouteMatcher: RouteMatcher<AppPageInterceptingRouteDefinition>

  constructor(definition: AppPageInterceptingRouteDefinition) {
    super(definition)
    this.interceptingRouteMatcher =
      new RouteMatcher<AppPageInterceptingRouteDefinition>({
        ...definition,
        pathname: definition.interceptingRoute,
      })
  }

  public get identity(): string {
    // TODO: probably include other details about the entrypoint
    return `${this.definition.pathname}?__nextPage=${this.definition.page}`
  }

  /**
   * Match will attempt to match the given pathname against this route while
   * also taking into account the referrer information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public match(
    pathname: string,
    options?: AppPageInterceptingRouteMatcherMatchOptions
  ): AppPageInterceptingRouteMatch | null {
    // This is like the parent `match` method but instead this injects the
    // additional `options` into the
    const result = this.test(pathname, options)
    if (!result) return null

    return {
      definition: this.definition,
      params: result.params,
    }
  }

  /**
   * Test will attempt to match the given pathname against this route while
   * also taking into account the referrer information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public test(
    pathname: string,
    options?: AppPageInterceptingRouteMatcherMatchOptions
  ) {
    // If this route does not have referrer information, then we can't match.
    if (!options?.referrer) {
      return null
    }

    // If the intercepting route match does not match, then this route does not
    // match.
    if (!this.interceptingRouteMatcher.test(options.referrer)) {
      return null
    }

    // Perform the underlying test with the intercepted route definition.
    return super.test(pathname)
  }
}
