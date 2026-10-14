import type { Page, Route } from '../shared/lib/route-types'
import {
  findIncompatibleParallelRouteSlots,
  normalizeCatchAllRoutes as normalizeCatchAllRoutesInternal,
  type NormalizeCatchAllRoutesOptions,
} from '../server/lib/router-utils/normalize-catchall-routes'

export { findIncompatibleParallelRouteSlots }

// The legacy matcher returns unmatched module IDs only by filtering and sorting
// original input values (not by constructing new IDs). Retain their Page role in
// this build-owned overload without changing the shared matcher or its result.
export function normalizeCatchAllRoutes(
  appPaths: Record<Route, Page[]>,
  options?: NormalizeCatchAllRoutesOptions
): Omit<
  ReturnType<typeof normalizeCatchAllRoutesInternal>,
  'unmatchedAppPages'
> & {
  unmatchedAppPages: Page[]
}
export function normalizeCatchAllRoutes(
  appPaths: Record<string, string[]>,
  options: NormalizeCatchAllRoutesOptions = {}
) {
  return normalizeCatchAllRoutesInternal(appPaths, undefined, options)
}
