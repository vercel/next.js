import { parseNormalizedAppRoute } from '../shared/lib/router/routes/app'

type OutputExportDynamicFallbackConfig = {
  output?: string
  cacheComponents?: boolean
  experimental?: {
    optimisticRouting?: boolean
    varyParams?: boolean
  }
}

type OutputExportFallbackConflict = {
  fallbackPath: string
  routes: string[]
}

export type OutputExportFallbackManifestEntry = {
  route: string
  fallbackPath: string
}

export function getOutputExportFallbackPath(staticPrefix: string): string {
  return staticPrefix.length > 0 ? `/${staticPrefix}/__fallback` : '/__fallback'
}

export function getOutputExportFallbackMetadataPath(
  fallbackPath: string
): string {
  return `${fallbackPath}.meta.json`
}

export function getOutputExportFallbackVariantPath(
  fallbackPath: string,
  index: number
): string {
  return `${fallbackPath}/__route_${index}`
}

export function getOutputExportFallbackStaticPrefix(
  routePath: string
): string | null {
  const route = parseNormalizedAppRoute(routePath)
  const firstDynamicIndex = route.segments.findIndex(
    (segment) => segment.type === 'dynamic'
  )

  if (firstDynamicIndex === -1) {
    return null
  }

  return route.segments
    .slice(0, firstDynamicIndex)
    .map((segment) => segment.name)
    .join('/')
}

export function getOutputExportFallbackConflicts(
  routePaths: Iterable<string>
): OutputExportFallbackConflict[] {
  const fallbackPathToRoutes = new Map<string, string[]>()

  for (const routePath of routePaths) {
    const staticPrefix = getOutputExportFallbackStaticPrefix(routePath)
    if (staticPrefix === null) {
      continue
    }

    const fallbackPath = getOutputExportFallbackPath(staticPrefix)
    const routes = fallbackPathToRoutes.get(fallbackPath)
    if (routes) {
      routes.push(routePath)
    } else {
      fallbackPathToRoutes.set(fallbackPath, [routePath])
    }
  }

  const conflicts: OutputExportFallbackConflict[] = []
  for (const [fallbackPath, routes] of fallbackPathToRoutes) {
    if (routes.length > 1) {
      conflicts.push({
        fallbackPath,
        routes: routes.sort(),
      })
    }
  }

  return conflicts.sort((a, b) =>
    a.fallbackPath < b.fallbackPath
      ? -1
      : a.fallbackPath > b.fallbackPath
        ? 1
        : 0
  )
}

export function isOutputExportDynamicFallbackEnabled(
  config: OutputExportDynamicFallbackConfig
): boolean {
  return config.output === 'export' && config.cacheComponents === true
}

export function isOutputExportOptimisticRoutingEnabled(
  config: OutputExportDynamicFallbackConfig
): boolean {
  return (
    Boolean(config.experimental?.optimisticRouting) ||
    isOutputExportDynamicFallbackEnabled(config)
  )
}

export function isOutputExportVaryParamsEnabled(
  config: OutputExportDynamicFallbackConfig
): boolean {
  return (
    Boolean(config.experimental?.varyParams) ||
    isOutputExportDynamicFallbackEnabled(config)
  )
}
