import { AcceptedPlugin } from 'postcss'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'
import { cssFileResolve } from './file-resolve'
import postcss from 'postcss'

export function getGlobalCssLoader(
  ctx: ConfigurationContext,
  postCssPlugins: AcceptedPlugin[],
  preProcessors: readonly webpack.RuleSetUseItem[] = []
): webpack.RuleSetUseItem[] {
  const loaders: webpack.RuleSetUseItem[] = []

  if (ctx.isClient) {
    // Add appropriate development more or production mode style
    // loader
    loaders.push(
      getClientStyleLoader({
        isDevelopment: ctx.isDevelopment,
        assetPrefix: ctx.assetPrefix,
      })
    )
  }

  // Resolve CSS `@import`s and `url()`s
  loaders.push({
    loader: require.resolve('../../../../loaders/css-loader/src'),
    options: {
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
      postcss: postcss(postCssPlugins),
    },
  })

  loaders.push(
    // Webpack loaders run like a stack, so we need to reverse the natural
    // order of preprocessors.
    ...preProcessors.slice().reverse()
  )

  return loaders
}
