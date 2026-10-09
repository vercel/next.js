import {
  findIncompatibleParallelRouteSlots,
  normalizeCatchAllRoutes as normalizeCatchAllRoutesInternal,
  type NormalizeCatchAllRoutesOptions,
} from '../server/lib/router-utils/normalize-catchall-routes'

export { findIncompatibleParallelRouteSlots }

export function normalizeCatchAllRoutes(
  appPaths: Record<string, string[]>,
  options: NormalizeCatchAllRoutesOptions = {}
) {
  return normalizeCatchAllRoutesInternal(appPaths, undefined, options)
}
