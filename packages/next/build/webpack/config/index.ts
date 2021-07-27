import { webpack } from 'next/dist/compiled/webpack/webpack'
import { NextConfigComplete } from '../../../server/config-shared'
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
    sassOptions,
    productionBrowserSourceMaps,
    future,
    isCraCompat,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    assetPrefix: string
    sassOptions: any
    productionBrowserSourceMaps: boolean
    future: NextConfigComplete['future']
    isCraCompat?: boolean
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
    sassOptions,
    productionBrowserSourceMaps,
    future,
    isCraCompat,
  }

  const fn = pipe(base(ctx), css(ctx))
  return fn(config)
}
