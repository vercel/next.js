import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfigComplete } from '../../../server/config-shared'
import type { ConfigurationContext } from './utils'

import { base } from './blocks/base'
import { css } from './blocks/css'
import { images } from './blocks/images'
import { pipe } from './utils'

export async function buildConfiguration(
  config: webpack.Configuration,
  {
    hasAppDir,
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
    transpilePackages,
    experimental,
    disableStaticImages,
    serverSourceMaps,
  }: {
    hasAppDir: boolean
    supportedBrowsers: string[] | undefined
    rootDirectory: string
    customAppFile: RegExp | undefined
    isDevelopment: boolean
    isServer: boolean
    isEdgeRuntime: boolean
    targetWeb: boolean
    assetPrefix: string
    sassOptions: any
    productionBrowserSourceMaps: boolean
    transpilePackages: NextConfigComplete['transpilePackages']
    future: NextConfigComplete['future']
    experimental: NextConfigComplete['experimental']
    disableStaticImages: NextConfigComplete['disableStaticImages']
    serverSourceMaps: NextConfigComplete['experimental']['serverSourceMaps']
  }
): Promise<webpack.Configuration> {
  const ctx: ConfigurationContext = {
    hasAppDir,
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
    transpilePackages,
    future,
    experimental,
    serverSourceMaps: serverSourceMaps ?? false,
  }

  let fns = [base(ctx), css(ctx)]
  if (!disableStaticImages) {
    fns.push(images(ctx))
  }
  const fn = pipe(...fns)
  return fn(config)
}
