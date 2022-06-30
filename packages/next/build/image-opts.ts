import { NextConfigComplete } from '../server/config-shared'

export function getNextImageOpts(
  config: NextConfigComplete,
  dev: boolean
): string {
  return JSON.stringify({
    deviceSizes: config.images.deviceSizes,
    imageSizes: config.images.imageSizes,
    path: config.images.path,
    loader: config.images.loader,
    experimentalUnoptimized: config?.experimental?.images?.unoptimized,
    experimentalFuture: config.experimental?.images?.allowFutureImage,
    ...(dev
      ? {
          // Allow domains in development to validate on the client
          // but exclude in production to avoid sharing private details.
          domains: config.images.domains,
          experimentalRemotePatterns:
            config.experimental?.images?.remotePatterns,
        }
      : {}),
  })
}
