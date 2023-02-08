import { RouteKind } from '../route-kind'
import { RouteMatcher } from '../route-matchers/route-matcher'
import { RouteMatch } from '../route-matches/route-match'

export interface RouteMatcherManager {
  push(matcher: RouteMatcher<RouteKind>): void
  match(
    pathname: string,
    options?: { skipDynamic?: boolean }
  ): Promise<RouteMatch<RouteKind> | null>
  compile(): Promise<void>
}
