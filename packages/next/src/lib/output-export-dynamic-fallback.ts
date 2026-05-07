import { parseNormalizedAppRoute } from '../shared/lib/router/routes/app'
import { getParamProperties } from '../shared/lib/router/utils/get-segment-param'

type OutputExportDynamicFallbackConfig = {
  output?: string
  cacheComponents?: boolean
  experimental?: {
    optimisticRouting?: boolean
    outputExportDynamicFallbacks?: boolean
    varyParams?: boolean
  }
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

export function isOutputExportDynamicFallbackEnabled(
  config: OutputExportDynamicFallbackConfig
): boolean {
  return (
    config.output === 'export' &&
    config.cacheComponents === true &&
    config.experimental?.outputExportDynamicFallbacks === true
  )
}

export function needsOutputExportFallbackManifest(routePath: string): boolean {
  const route = parseNormalizedAppRoute(routePath)
  const firstDynamicIndex = route.segments.findIndex(
    (segment) => segment.type === 'dynamic'
  )

  if (firstDynamicIndex === -1) {
    return false
  }

  if (route.segments.length - firstDynamicIndex <= 1) {
    return false
  }

  const firstDynamicSegment = route.segments[firstDynamicIndex]
  return (
    firstDynamicSegment.type === 'dynamic' &&
    !getParamProperties(firstDynamicSegment.param.paramType).repeat
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
