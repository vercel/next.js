import postcss from 'postcss'
import webpack from 'webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'

export function getGlobalCssLoader(
  ctx: ConfigurationContext,
  postCssPlugins: readonly postcss.AcceptedPlugin[],
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
    loader: require.resolve('css-loader'),
    options: {
      importLoaders: 1 + preProcessors.length,
      sourceMap: true,
      // don't use `modules: false` or else syntax errors won't
      // be built correctly
      modules: {
        mode: 'global',
      },
    },
  })

  // Compile CSS
  loaders.push({
    loader: require.resolve('next/dist/compiled/postcss-loader'),
    options: {
      ident: '__nextjs_postcss',
      plugins: postCssPlugins,
      sourceMap: true,
    },
  })

  loaders.push(
    // Webpack loaders run like a stack, so we need to reverse the natural
    // order of preprocessors.
    ...preProcessors.slice().reverse()
  )

  return loaders
}
