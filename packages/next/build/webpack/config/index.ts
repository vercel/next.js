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
    hasSupportData,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    hasSupportCss: boolean
    hasSupportData: boolean
  }
): Promise<webpack.Configuration> {
  const ctx: ConfigurationContext = {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isProduction: !isDevelopment,
    isServer,
    isClient: !isServer,
  }

  const fn = pipe(
    base(ctx),
    experimentData(hasSupportData, ctx),
    css(hasSupportCss, ctx)
  )
  return fn(config)
}
