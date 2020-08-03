import webpack from 'webpack'
import { base } from './blocks/base'
import { css } from './blocks/css'
import { ConfigurationContext, pipe } from './utils'

export async function build(
  config: webpack.Configuration,
  {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isServer,
    assetPrefix,
    cssOptions,
    sassOptions,
    productionBrowserSourceMaps,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    assetPrefix: string
    cssOptions: any
    sassOptions: any
    productionBrowserSourceMaps: boolean
  }
): Promise<webpack.Configuration> {
  const ctx: ConfigurationContext = {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isProduction: !isDevelopment,
    isServer,
    isClient: !isServer,
    assetPrefix: assetPrefix
      ? assetPrefix.endsWith('/')
        ? assetPrefix.slice(0, -1)
        : assetPrefix
      : '',
    cssOptions,
    sassOptions,
    productionBrowserSourceMaps,
  }

  const fn = pipe(base(ctx), css(ctx))
  return fn(config)
}
