import type { Route } from '../../../shared/lib/route-types'
import type { Normalizer } from '../normalizer'

export class PrefixPathnameNormalizer implements Normalizer<Route, Route> {
  constructor(private readonly prefix: string) {
    if (prefix.endsWith('/')) {
      throw new Error(
        `PrefixPathnameNormalizer: prefix "${prefix}" should not end with a slash`
      )
    }
  }

  public match(pathname: Route) {
    // If the pathname doesn't start with the prefix, we don't match.
    if (pathname !== this.prefix && !pathname.startsWith(this.prefix + '/')) {
      return false
    }

    return true
  }

  public normalize(pathname: Route, matched?: boolean): Route {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    if (pathname.length === this.prefix.length) {
      return '/' as Route
    }

    return pathname.substring(this.prefix.length) as Route
  }
}
