import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../../../server/config-shared'

import { base } from './blocks/base'
import { css } from './blocks/css'
import { images } from './blocks/images'
import { ConfigurationContext, pipe } from './utils'

export async function build(
  config: webpack.Configuration,
  {
    supportedBrowsers,
    rootDirectory,
    customAppFile,
    isDevelopment,
    isServer,
    isEdgeRuntime,
    targetWeb,
    assetPrefix,
    sassOptions,
    productionBrowserSourceMaps,
    future,
    experimental,
    disableStaticImages,
  }: {
    supportedBrowsers: string[] | undefined
    rootDirectory: string
    customAppFile: RegExp
    isDevelopment: boolean
    isServer: boolean
    isEdgeRuntime: boolean
    targetWeb: boolean
    assetPrefix: string
    sassOptions: any
    productionBrowserSourceMaps: boolean
    future: NextConfigComplete['future']
    experimental: NextConfigComplete['experimental']
    disableStaticImages: NextConfigComplete['disableStaticImages']
  }
): Promise<webpack.Configuration> {
  const ctx: ConfigurationContext = {
    supportedBrowsers,
    rootDirectory,
    customAppFile,
    isDevelopment,
    isProduction: !isDevelopment,
    isServer,
    isEdgeRuntime,
    isClient: !isServer,
    targetWeb,
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

  let fns = [base(ctx), css(ctx)]
  if (!disableStaticImages) {
    fns.push(images(ctx))
  }
  const fn = pipe(...fns)
  return fn(config)
}
