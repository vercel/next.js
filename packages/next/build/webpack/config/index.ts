import { webpack } from 'next/dist/compiled/webpack/webpack'
import { NextConfigComplete } from '../../../server/config-shared'
import { base } from './blocks/base'
import { css } from './blocks/css'
import { images } from './blocks/images'
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
    experimental,
  }: {
    rootDirectory: string
    customAppFile: RegExp
    isDevelopment: boolean
    isServer: boolean
    assetPrefix: string
    sassOptions: any
    productionBrowserSourceMaps: boolean
    future: NextConfigComplete['future']
    experimental: NextConfigComplete['experimental']
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
    experimental,
  }

  const fn = pipe(base(ctx), css(ctx), images(ctx))
  return fn(config)
}
