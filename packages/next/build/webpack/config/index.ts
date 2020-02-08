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
    hasSupportCss,
    hasSupportScss,
    assetPrefix,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    hasSupportCss: boolean
    hasSupportScss: boolean
    assetPrefix: string
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
  }

  const fn = pipe(base(ctx), css(hasSupportCss, hasSupportScss, ctx))
  return fn(config)
}
