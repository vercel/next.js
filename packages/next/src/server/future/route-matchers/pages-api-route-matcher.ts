import { RouteMatcher } from './route-matcher'
import { PagesAPIRouteMatch } from '../route-matches/pages-api-route-match'

export class PagesAPIRouteMatcher extends RouteMatcher<PagesAPIRouteMatch> {
  public match(pathname: string): PagesAPIRouteMatch | null {
    const result = this.test(pathname)
    if (!result) return null

    return { route: this.route, params: result.params }
  }
}
