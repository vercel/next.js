import { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { RouteMatcher } from '../route-matchers/route-matcher'
import { RouteMatch } from '../route-matches/route-match'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import { RouteMatcherManager } from './route-matcher-manager'

export interface RouteEnsurer {
  ensure(match: RouteMatch<RouteKind>): Promise<void>
}

export class DevRouteMatcherManager implements RouteMatcherManager {
  private readonly development: RouteMatcherManager

  constructor(
    private readonly production: RouteMatcherManager,
    private readonly ensurer: RouteEnsurer,
    localeNormalizer?: Normalizer
  ) {
    this.development = new DefaultRouteMatcherManager(localeNormalizer)
  }

  public push(matcher: RouteMatcher<RouteKind>): void {
    this.development.push(matcher)
  }

  public async match(
    pathname: string,
    options?: { skipDynamic?: boolean }
  ): Promise<RouteMatch<RouteKind> | null> {
    let match = await this.production.match(pathname, options)
    if (match) return match

    match = await this.development.match(pathname, options)
    if (!match) return null

    // There was a match! This means that we didn't previously match the
    // production matcher. Let's ensure the page so it gets built, and then
    // recompile the production matcher.
    await this.ensurer.ensure(match)
    await this.production.compile()

    // Now that the production matcher has been recompiled, we should be able to
    // match the pathname on it. If we can't that represents a disconnect
    // between the development matchers and the production matchers, which would
    // be a big problem!
    match = await this.production.match(pathname)
    if (!match) {
      throw new Error(
        'Invariant: development match was found, but not found after ensuring'
      )
    }

    return match
  }

  public async compile(): Promise<void> {
    // Compile the production routes again.
    await this.production.compile()

    // Compile the development routes.
    await this.development.compile()
  }
}
