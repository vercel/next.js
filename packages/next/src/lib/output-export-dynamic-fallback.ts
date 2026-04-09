type OutputExportDynamicFallbackConfig = {
  output?: string
  cacheComponents?: boolean
  experimental?: {
    optimisticRouting?: boolean
    varyParams?: boolean
  }
}

export function getOutputExportFallbackPath(staticPrefix: string): string {
  return staticPrefix.length > 0 ? `/${staticPrefix}/__fallback` : '/__fallback'
}

export function getOutputExportFallbackStaticPrefix(
  routePath: string
): string | null {
  const segments = routePath.split('/').filter(Boolean)
  const firstDynamicIndex = segments.findIndex(
    (segment) => segment.startsWith('[') && segment.endsWith(']')
  )

  if (firstDynamicIndex === -1) {
    return null
  }

  return segments.slice(0, firstDynamicIndex).join('/')
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
