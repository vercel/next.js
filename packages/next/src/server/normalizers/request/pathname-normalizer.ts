import type { Route } from '../../../shared/lib/route-types'
import type { Normalizer } from '../normalizer'

export interface PathnameNormalizer extends Normalizer<Route, Route> {
  match(pathname: Route): boolean
  normalize(pathname: Route, matched?: boolean): Route
}
