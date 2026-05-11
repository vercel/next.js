import { getSortedRoutes } from '../shared/lib/router/utils'
import {
  getOutputExportFallbackPath,
  getOutputExportFallbackStaticPrefix,
  getOutputExportFallbackVariantPath,
  needsOutputExportFallbackRouteManifest,
} from './output-export-dynamic-fallback'

export type OutputExportDynamicRouteInfo = {
  fallbackSourceRoute: string | undefined
  fallbackRouteParams:
    | ReadonlyArray<{
        paramName: string
        paramType: string
      }>
    | undefined
}

export type OutputExportFallbackRouteEntry = {
  route: string
  fallbackSourceRoute: string
  fallbackRoute: string
  fallbackPath: string
  staticPrefix: string
}

export type OutputExportFallbackRoutePlan = {
  fallbackRoute: string
  needsRouteManifest: boolean
  entries: OutputExportFallbackRouteEntry[]
}

export function planOutputExportFallbackRoutes(
  dynamicRoutes: Readonly<Record<string, OutputExportDynamicRouteInfo>>
): OutputExportFallbackRoutePlan[] {
  const fallbackEntriesByRoute = new Map<
    string,
    Array<Omit<OutputExportFallbackRouteEntry, 'fallbackPath'>>
  >()

  for (const [dynamicRoute, prerenderInfo] of Object.entries(dynamicRoutes)) {
    if (
      !prerenderInfo.fallbackSourceRoute ||
      !prerenderInfo.fallbackRouteParams ||
      prerenderInfo.fallbackRouteParams.length === 0
    ) {
      continue
    }

    const staticPrefix = getOutputExportFallbackStaticPrefix(dynamicRoute)
    if (staticPrefix === null) {
      continue
    }

    const fallbackRoute = getOutputExportFallbackPath(staticPrefix)
    const entries = fallbackEntriesByRoute.get(fallbackRoute)
    const entry = {
      route: dynamicRoute,
      fallbackSourceRoute: prerenderInfo.fallbackSourceRoute,
      fallbackRoute,
      staticPrefix,
    }

    if (entries) {
      entries.push(entry)
    } else {
      fallbackEntriesByRoute.set(fallbackRoute, [entry])
    }
  }

  return Array.from(fallbackEntriesByRoute.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fallbackRoute, entries]) => {
      if (entries.length === 1) {
        return {
          fallbackRoute,
          needsRouteManifest: needsOutputExportFallbackRouteManifest(
            entries[0].route
          ),
          entries: [
            {
              ...entries[0],
              fallbackPath: fallbackRoute,
            },
          ],
        }
      }

      const entriesByRoute = new Map(
        entries.map((entry) => [entry.route, entry])
      )
      // Multiple dynamic routes can share the same static prefix and therefore
      // the same public fallback entry, e.g. /docs/[slug] and /docs/[...rest].
      // Store each real fallback under a deterministic private path, ordered the
      // same way the router would match the route at runtime.
      const sortedRoutes = getSortedRoutes(entries.map((entry) => entry.route))
      return {
        fallbackRoute,
        needsRouteManifest: true,
        entries: sortedRoutes.map((route, index) => ({
          ...entriesByRoute.get(route)!,
          fallbackPath: getOutputExportFallbackVariantPath(
            fallbackRoute,
            index
          ),
        })),
      }
    })
}
