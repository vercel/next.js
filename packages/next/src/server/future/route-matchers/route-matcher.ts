import { isDynamicRoute } from '../../../shared/lib/router/utils'
import {
  getRouteMatcher,
  Params,
  RouteMatchFn,
} from '../../../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { RouteMatch } from '../route-matches/route-match'

export abstract class RouteMatcher<M extends RouteMatch = RouteMatch> {
  private readonly dynamic?: RouteMatchFn

  constructor(public readonly route: M['route']) {
    if (isDynamicRoute(route.pathname)) {
      this.dynamic = getRouteMatcher(getRouteRegex(route.pathname))
    }
  }

  public get isDynamic() {
    return this.dynamic !== undefined
  }

  public abstract match(pathname: string): M | null

  protected test(pathname: string): { params?: Params } | null {
    if (this.dynamic) {
      const params = this.dynamic(pathname)
      if (!params) return null

      return { params }
    }

    if (pathname === this.route.pathname) {
      return {}
    }

    return null
  }
}
