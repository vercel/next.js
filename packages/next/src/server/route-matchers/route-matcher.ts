import { RouteType } from '../route-matches/route-match'

export interface Route<R extends RouteType> {
  type: R
  pathname: string
  filename: string
}

export interface RouteMatcher<R extends RouteType> {
  routes(): ReadonlyArray<Route<R>>
}
