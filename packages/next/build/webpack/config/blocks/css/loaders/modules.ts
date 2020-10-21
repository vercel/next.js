import { AcceptedPlugin } from 'postcss'
import webpack from 'webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'
import { cssFileResolve } from './file-resolve'
import { getCssModuleLocalIdent } from './getCssModuleLocalIdent'

export function getCssModuleLoader(
  ctx: ConfigurationContext,
  postCssPlugins: readonly AcceptedPlugin[],
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
      // Use CJS mode for backwards compatibility:
      esModule: false,
      url: cssFileResolve,
      import: (url: string, _: any, resourcePath: string) =>
        cssFileResolve(url, resourcePath),
      modules: {
        // Do not transform class names (CJS mode backwards compatibility):
        exportLocalsConvention: 'asIs',
        // Server-side (Node.js) rendering support:
        exportOnlyLocals: ctx.isServer,
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
    loader: require.resolve('next/dist/compiled/postcss-loader'),
    options: {
      postcssOptions: { plugins: postCssPlugins, config: false },
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
