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
    hasReactRefresh,
    assetPrefix,
    sassOptions,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    hasReactRefresh: boolean
    assetPrefix: string
    sassOptions: any
  }
): Promise<webpack.Configuration> {
  const ctx: ConfigurationContext = {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isProduction: !isDevelopment,
    hasReactRefresh,
    isServer,
    isClient: !isServer,
    assetPrefix: assetPrefix
      ? assetPrefix.endsWith('/')
        ? assetPrefix.slice(0, -1)
        : assetPrefix
      : '',
    sassOptions,
  }

  const fn = pipe(base(ctx), css(ctx))
  return fn(config)
}
