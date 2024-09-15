import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { ConfigurationContext } from '../../../utils'

import { getClientStyleLoader } from './client'
import { cssFileResolve } from './file-resolve'

export function getGlobalCssLoader(
  ctx: ConfigurationContext,
  postcss: any,
  preProcessors: readonly webpack.RuleSetUseItem[] = []
): webpack.RuleSetUseItem[] {
  const loaders: webpack.RuleSetUseItem[] = []

  if (ctx.isClient) {
    // Add appropriate development more or production mode style
    // loader
    loaders.push(
      getClientStyleLoader({
        hasAppDir: ctx.hasAppDir,
        isAppDir: ctx.isAppDir,
        isDevelopment: ctx.isDevelopment,
        assetPrefix: ctx.assetPrefix,
      })
    )
  }

  if (ctx.experimental.useLightningcss) {
    loaders.push({
      loader: require.resolve('../../../../loaders/lightningcss-loader/src'),
      options: {
        importLoaders: 1 + preProcessors.length,
        url: (url: string, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
        import: (url: string, _: any, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
        modules: false,
        targets: ctx.supportedBrowsers,
        postcss,
      },
    })
  } else {
    // Resolve CSS `@import`s and `url()`s
    loaders.push({
      loader: require.resolve('../../../../loaders/css-loader/src'),
      options: {
        postcss,
        importLoaders: 1 + preProcessors.length,
        // Next.js controls CSS Modules eligibility:
        modules: false,
        url: (url: string, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
        import: (url: string, _: any, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
      },
    })

    // Compile CSS
    loaders.push({
      loader: require.resolve('../../../../loaders/postcss-loader/src'),
      options: {
        postcss,
      },
    })
  }

  loaders.push(
    // Webpack loaders run like a stack, so we need to reverse the natural
    // order of preprocessors.
    ...preProcessors.slice().reverse()
  )

  return loaders
}
