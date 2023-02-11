import { RouteMatcher } from './route-matcher'
import { AppPageRouteMatch } from '../route-matches/app-page-route-match'

export class AppPageRouteMatcher extends RouteMatcher<AppPageRouteMatch> {
  public match(pathname: string): AppPageRouteMatch | null {
    const result = this.test(pathname)
    if (!result) return null

    return { route: this.route, params: result.params }
  }
}
