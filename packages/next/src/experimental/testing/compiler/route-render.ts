import type { NextConfigComplete } from '../../../server/config-shared'
import { parseMaxPostponedStateSize } from '../../../shared/lib/size-limit'
import type { CompiledTestRouteRenderOpts, TestProfile } from '../contracts'

/** The same resolved option values used by the normal AppPage handler. */
export function createCompiledRouteRenderOpts(
  config: NextConfigComplete,
  mode: TestProfile['mode']
): CompiledTestRouteRenderOpts {
  return {
    clientAssetToken: config.supportsImmutableAssets
      ? ''
      : config.deploymentId || '',
    htmlLimitedBots: config.htmlLimitedBots,
    reactDebugChannel:
      mode === 'development' && config.experimental.reactDebugChannel === true,
    basePath: config.basePath,
    trailingSlash: config.trailingSlash,
    images: {
      ...config.images,
      // URL instances do not retain their fields across Node's IPC serializer.
      // Preserve their actual pattern values as the equivalent supported object.
      remotePatterns: config.images.remotePatterns.map((pattern) =>
        pattern instanceof URL
          ? {
              protocol: pattern.protocol.slice(0, -1) as 'http' | 'https',
              hostname: pattern.hostname,
              port: pattern.port,
              pathname: pattern.pathname,
              search: pattern.search,
            }
          : pattern
      ),
    },
    crossOrigin: config.crossOrigin,
    enableTainting: config.experimental.taint,
    reactMaxHeadersLength: config.reactMaxHeadersLength,
    nextConfigOutput: config.output,
    partialPrefetching: config.partialPrefetching,
    serverActions: config.experimental.serverActions,
    logServerFunctions:
      typeof config.logging === 'object' &&
      Boolean(config.logging.serverFunctions),
    experimental: {
      expireTime: config.expireTime,
      staleTimes: config.experimental.staleTimes,
      dynamicOnHover: Boolean(config.experimental.dynamicOnHover),
      optimisticRouting: Boolean(config.experimental.optimisticRouting),
      parallelRouteMetadata: Boolean(config.experimental.parallelRouteMetadata),
      inlineCss: Boolean(config.experimental.inlineCss),
      prefetchInlining: config.experimental.prefetchInlining ?? false,
      reactBrowserBailout: Boolean(config.experimental.reactBrowserBailout),
      serverComponentsHmrCancellation: Boolean(
        config.experimental.serverComponentsHmrCancellation
      ),
      cachedNavigations: config.experimental.cachedNavigations ?? false,
      clientTraceMetadata: config.experimental.clientTraceMetadata || [],
      clientParamParsingOrigins: config.experimental.clientParamParsingOrigins,
      maxPostponedStateSizeBytes: parseMaxPostponedStateSize(
        config.experimental.maxPostponedStateSize
      ),
      disableResumeDataCacheCompression:
        config.experimental.disableResumeDataCacheCompression ?? false,
      exposeTestingApi:
        config.cacheComponents === true &&
        (mode === 'development' ||
          config.experimental.exposeTestingApiInProductionBuild === true),
    },
  }
}
