import type { Route } from '../../../shared/lib/route-types'
import type { Normalizer } from '../normalizer'

export class SuffixPathnameNormalizer implements Normalizer<Route, Route> {
  constructor(private readonly suffix: string) {}

  public match(pathname: Route) {
    // If the pathname doesn't end in the suffix, we don't match.
    if (!pathname.endsWith(this.suffix)) return false

    return true
  }

  public normalize(pathname: Route, matched?: boolean): Route {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    return pathname.substring(0, pathname.length - this.suffix.length) as Route
  }
}
