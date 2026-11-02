import { isDynamicRoute } from '../../shared/lib/router/utils/is-dynamic'

/**
 * Keep concrete Go artifacts ahead of synthetic Node RSC/segment branches,
 * without changing ordinary route specificity or conditions.
 */
export function prioritizeGoArtifacts<
  T extends { has?: unknown[]; missing?: unknown[] },
>(
  routes: readonly T[],
  goRoutes: ReadonlyMap<string, T>,
  rscSources: ReadonlyMap<T, string>,
  segmentDestinations: ReadonlyMap<T, string>
): T[] {
  const routeIndexes = new Map(routes.map((route, index) => [route, index]))
  return routes.flatMap((route, index) => {
    const rscSource = rscSources.get(route)
    const segmentDestination = segmentDestinations.get(route)
    if (!rscSource && !segmentDestination) return [route]

    // Next combines these two concrete segment destinations with $segment.
    const segmentTargets = segmentDestination?.endsWith('$segment')
      ? [
          segmentDestination.replace(/\$segment$/, '.segment.rsc'),
          segmentDestination.replace(/\$segment$/, '/__PAGE__.segment.rsc'),
        ]
      : [segmentDestination]

    const overrides: T[] = []
    for (const [source, goRoute] of goRoutes) {
      if (routeIndexes.get(goRoute)! <= index) continue
      if (
        !segmentTargets.includes(source) &&
        (!rscSource ||
          (source !== `${rscSource}.rsc` &&
            !(
              source.startsWith(`${rscSource}.segments/`) &&
              source.endsWith('.segment.rsc') &&
              !isDynamicRoute(source.slice(rscSource.length), false)
            )))
      ) {
        continue
      }
      // The original Go entry still handles requests where this synthetic
      // branch's conditions do not hold.
      overrides.push({ ...goRoute, has: route.has, missing: route.missing })
    }
    return [...overrides, route]
  })
}
