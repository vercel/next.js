import type { TelemetryLoaderContext } from './telemetry-plugin'
export type SwcTransformTelemetryOutput = {
  eliminatedPackages?: string
  useCacheTelemetryTracker?: string
}

export function updateTelemetryLoaderCtxFromTransformOutput(
  ctx: TelemetryLoaderContext,
  output: SwcTransformTelemetryOutput
) {
  if (output.eliminatedPackages && ctx.eliminatedPackages) {
    for (const pkg of JSON.parse(output.eliminatedPackages)) {
      ctx.eliminatedPackages.add(pkg)
    }
  }

  if (output.useCacheTelemetryTracker && ctx.useCacheTracker) {
    for (const [key, value] of JSON.parse(output.useCacheTelemetryTracker)) {
      const prefixedKey = `useCache/${key}` as const
      const numericValue = Number(value)
      if (!isNaN(numericValue)) {
        ctx.useCacheTracker.set(
          prefixedKey,
          (ctx.useCacheTracker.get(prefixedKey) || 0) + numericValue
        )
      }
    }
  }
}
