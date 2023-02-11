import { RouteMatcher } from './route-matcher'
import { PagesRouteMatch } from '../route-matches/pages-route-match'

export class PagesRouteMatcher extends RouteMatcher<PagesRouteMatch> {
  public match(pathname: string): PagesRouteMatch | null {
    const result = this.test(pathname)
    if (!result) return null

    // TODO: could use this area to add locale information to the match

    return { route: this.route, params: result.params }
  }
}
