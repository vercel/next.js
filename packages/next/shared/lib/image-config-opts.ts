import { NextConfigComplete } from '../../server/config-shared'
import { LoaderValue, RemotePattern } from './image-config'

export interface ImageConfigOpts {
  deviceSizes: number[]
  imageSizes: number[]
  path: string
  loader: LoaderValue
  dangerouslyAllowSVG: boolean
  experimentalUnoptimized: boolean
  experimentalFuture: boolean
  domains?: string[]
  experimentalRemotePatterns?: RemotePattern[]
}

export function imageConfigOpts({
  config,
  dev,
}: {
  config: Pick<NextConfigComplete, 'images' | 'experimental'>
  dev: boolean
}): string {
  const opts: ImageConfigOpts = {
    deviceSizes: config.images.deviceSizes,
    imageSizes: config.images.imageSizes,
    path: config.images.path,
    loader: config.images.loader,
    dangerouslyAllowSVG: config.images.dangerouslyAllowSVG,
    experimentalUnoptimized: config.experimental?.images?.unoptimized || false,
    experimentalFuture: config.experimental?.images?.allowFutureImage || false,
    // The follow are only needed during development to allow validating on the client.
    // We must not send this data during production to avoid leaking the list of valid domains.
    domains: dev ? config.images.domains : [],
    experimentalRemotePatterns: dev
      ? config.experimental?.images?.remotePatterns || []
      : [],
  }
  return JSON.stringify(opts)
}
