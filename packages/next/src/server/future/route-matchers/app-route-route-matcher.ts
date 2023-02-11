import { RouteMatcher } from './route-matcher'
import { AppRouteRouteMatch } from '../route-matches/app-route-route-match'

export class AppRouteRouteMatcher extends RouteMatcher<AppRouteRouteMatch> {
  public match(pathname: string): AppRouteRouteMatch | null {
    const result = this.test(pathname)
    if (!result) return null

    return { route: this.route, params: result.params }
  }
}
