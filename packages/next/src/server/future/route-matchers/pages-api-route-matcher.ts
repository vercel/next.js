import { RouteMatcher } from './route-matcher'
import { PagesAPIRouteMatch } from '../route-matches/pages-api-route-match'
import { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'
import { Normalizer } from '../normalizers/normalizer'

export class PagesAPIRouteMatcher extends RouteMatcher<PagesAPIRouteMatch> {
  constructor(
    route: PagesAPIRouteDefinition,
    private readonly localeNormalizer?: Normalizer
  ) {
    super(route)
  }

  public match(pathname: string): PagesAPIRouteMatch | null {
    pathname = this.localeNormalizer?.normalize(pathname) ?? pathname

    const result = this.test(pathname)
    if (!result) return null

    return { route: this.route, params: result.params }
  }
}
