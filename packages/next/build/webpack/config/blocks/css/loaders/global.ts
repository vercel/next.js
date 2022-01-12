import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'
import { cssFileResolve } from './file-resolve'

export function getGlobalCssRuleActions(
  ctx: ConfigurationContext,
  postcss: any,
  preProcessors: readonly webpack5.RuleSetUseItem[] = []
): Partial<webpack5.RuleSetRule> {
  let type: webpack5.RuleSetRule['type'] = undefined
  const loaders: webpack5.RuleSetUseItem[] = []

  if (ctx.experimental.webpackCss) {
    if (ctx.isClient) {
      type = 'css/global'
    } else {
      type = 'javascript/auto'
      loaders.push(
        require.resolve('../../../../../../compiled/ignore-loader/index.js')
      )
    }
  } else {
    type = 'javascript/auto'
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
  }

  // Compile CSS
  loaders.push({
    loader: require.resolve('../../../../loaders/postcss-loader/src'),
    options: {
      postcss,
    },
  })

  loaders.push(
    // Webpack loaders run like a stack, so we need to reverse the natural
    // order of preprocessors.
    ...preProcessors.slice().reverse()
  )

  return {
    type,
    use: loaders,
  }
}
