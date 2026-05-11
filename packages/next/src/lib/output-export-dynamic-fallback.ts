import { parseNormalizedAppRoute } from '../shared/lib/router/routes/app'

type OutputExportDynamicFallbackConfig = {
  output?: string
  cacheComponents?: boolean
  experimental?: {
    optimisticRouting?: boolean
    outputExportDynamicFallbacks?: boolean
    varyParams?: boolean
  }
}

export function getOutputExportFallbackPath(staticPrefix: string): string {
  return staticPrefix.length > 0 ? `/${staticPrefix}/__fallback` : '/__fallback'
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

export function isOutputExportDynamicFallbackEnabled(
  config: OutputExportDynamicFallbackConfig
): boolean {
  return (
    config.output === 'export' &&
    config.cacheComponents === true &&
    config.experimental?.outputExportDynamicFallbacks === true
  )
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
