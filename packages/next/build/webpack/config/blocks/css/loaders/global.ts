import postcss from 'postcss'
import webpack from 'webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'

export function getGlobalCssLoader(
  ctx: ConfigurationContext,
  postCssPlugins: postcss.AcceptedPlugin[]
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
    options: { importLoaders: 1, sourceMap: true },
  })

  // Compile CSS
  loaders.push({
    loader: require.resolve('postcss-loader'),
    options: {
      ident: '__nextjs_postcss',
      plugins: postCssPlugins,
      sourceMap: true,
    },
  })

  return loaders
}
