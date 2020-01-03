import webpack from 'webpack'
import { base } from './blocks/base'
import { css } from './blocks/css'
import { ConfigurationContext, pipe } from './utils'
import { experimentData } from './blocks/experiment-data'

export async function build(
  config: webpack.Configuration,
  {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isServer,
    hasSupportCss,
    hasExperimentalData,
    assetPrefix,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    hasSupportCss: boolean
    hasExperimentalData: boolean
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

  const fn = pipe(
    base(ctx),
    experimentData(hasExperimentalData, ctx),
    css(hasSupportCss, ctx)
  )
  return fn(config)
}
