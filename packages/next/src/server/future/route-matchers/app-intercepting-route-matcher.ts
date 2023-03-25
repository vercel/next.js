import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { AppPageRouteMatch } from '../route-matches/app-page-route-match'
import { RouteMatcher } from './route-matcher'

export type AppPageInterceptingRouteMatcherMatchOptions = {
  /**
   * If provided, this is used for intercepting routes to resolve.
   */
  referringRoute?: string
}

export class AppPageInterceptingRouteMatcher extends RouteMatcher<AppPageRouteDefinition> {
  private readonly interceptingRouteMatcher: RouteMatcher<AppPageRouteDefinition>

  constructor(definition: AppPageRouteDefinition) {
    super(definition)
    this.interceptingRouteMatcher = new RouteMatcher<AppPageRouteDefinition>({
      ...definition,
      pathname: definition.interceptingRoute!,
    })
  }

  public get identity(): string {
    // TODO: probably include other details about the entrypoint
    return `${this.definition.pathname}?__nextPage=${this.definition.page}`
  }

  /**
   * Match will attempt to match the given pathname against this route while
   * also taking into account the locale information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public match(
    pathname: string,
    options?: AppPageInterceptingRouteMatcherMatchOptions
  ): AppPageRouteMatch | null {
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
   * also taking into account the locale information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public test(
    pathname: string,
    options?: AppPageInterceptingRouteMatcherMatchOptions
  ) {
    if (!this.definition.interceptingRoute || !options?.referringRoute) {
      return null
    }

    const referrerPathname = new URL(options.referringRoute).pathname

    const matches =
      this.interceptingRouteMatcher.test(referrerPathname) !== null
    console.log({
      matches,
      referrerPathname,
      pathname: this.definition.pathname,
    })
    if (!matches) {
      return null
    }

    return super.test(pathname)
  }
}
