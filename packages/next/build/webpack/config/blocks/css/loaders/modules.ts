import postcss from 'postcss'
import webpack from 'webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'
import { getCssModuleLocalIdent } from './getCssModuleLocalIdent'

export function getCssModuleLoader(
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
    options: {
      importLoaders: 1,
      sourceMap: true,
      onlyLocals: ctx.isServer,
      modules: {
        // Disallow global style exports so we can code-split CSS and
        // not worry about loading order.
        mode: 'pure',
        // Generate a friendly production-ready name so it's
        // reasonably understandable. The same name is used for
        // development.
        // TODO: Consider making production reduce this to a single
        // character?
        getLocalIdent: getCssModuleLocalIdent,
      },
    },
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
