import type { RouteMatcher } from '../route-matchers/route-matcher'

export interface RouteMatcherProvider<M extends RouteMatcher = RouteMatcher> {
  matchers(): Promise<ReadonlyArray<M>>
}
