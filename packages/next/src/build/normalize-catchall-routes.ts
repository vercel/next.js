import type { Page, Route } from '../shared/lib/route-types'
import {
  findIncompatibleParallelRouteSlots,
  normalizeCatchAllRoutes as normalizeCatchAllRoutesInternal,
  type NormalizeCatchAllRoutesOptions,
} from '../server/lib/router-utils/normalize-catchall-routes'

export { findIncompatibleParallelRouteSlots }

export function normalizeCatchAllRoutes(
  appPaths: Record<Route, Page[]>,
  options: NormalizeCatchAllRoutesOptions = {}
) {
  return normalizeCatchAllRoutesInternal(appPaths, undefined, options)
}
