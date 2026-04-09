type OutputExportDynamicFallbackConfig = {
  output?: string
  cacheComponents?: boolean
  experimental?: {
    optimisticRouting?: boolean
    varyParams?: boolean
  }
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
