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

export type OutputExportFallbackRouteManifestEntry = {
  route: string
  fallbackPath: string
}

export function getOutputExportFallbackPath(staticPrefix: string): string {
  return staticPrefix.length > 0 ? `/${staticPrefix}/__fallback` : '/__fallback'
}

export function getOutputExportFallbackRouteManifestPath(
  fallbackPath: string
): string {
  // The static artifact keeps the short private `.meta.json` filename, but the
  // source API names this a route manifest because it disambiguates route
  // shapes that share the same public fallback entry.
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

export function needsOutputExportFallbackRouteManifest(
  routePath: string
): boolean {
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

  // A route like /blog/[slug] can resolve from /blog/__fallback by filling the
  // single dynamic segment from the URL. A route like /org/[org]/chat/[thread]
  // needs a small manifest so the client can confirm which route shape the
  // fallback artifact represents before patching params into the Flight tree.
  const firstDynamicSegment = route.segments[firstDynamicIndex]
  return (
    firstDynamicSegment.type === 'dynamic' &&
    !getParamProperties(firstDynamicSegment.param.paramType).repeat
  )
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
