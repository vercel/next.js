import postcss from 'postcss'
import webpack from 'webpack'
import { ConfigurationContext } from '../../../utils'
import MiniCssExtractPlugin from '../../../../plugins/mini-css-extract-plugin'

function getStyleLoader({
  isDevelopment,
  assetPrefix,
}: {
  isDevelopment: boolean
  assetPrefix: string
}): webpack.RuleSetUseItem {
  return isDevelopment
    ? {
        loader: require.resolve('style-loader'),
        options: {
          // By default, style-loader injects CSS into the bottom
          // of <head>. This causes ordering problems between dev
          // and prod. To fix this, we render a <noscript> tag as
          // an anchor for the styles to be placed before. These
          // styles will be applied _before_ <style jsx global>.
          insert: function(element: Element) {
            // These elements should always exist. If they do not,
            // this code should fail.
            var anchorElement = document.querySelector(
              '#__next_css__DO_NOT_USE__'
            )!

            // Append each global script immediately BEFORE the placeholder
            anchorElement.insertAdjacentElement('beforebegin', element)

            // Remember: this is development only code.
            //
            // After styles are injected, we need to remove the
            // <style> tags that set `body { display: none; }`.
            //
            // We use `requestAnimationFrame` as a way to defer
            // this operation since there may be multiple style
            // tags.
            ;(self.requestAnimationFrame || setTimeout)(function() {
              for (
                var x = document.querySelectorAll('[data-next-hide-fouc]'),
                  i = x.length;
                i--;

              ) {
                x[i].parentNode!.removeChild(x[i])
              }
            })
          },
        },
      }
    : {
        loader: MiniCssExtractPlugin.loader,
        options: { publicPath: `${assetPrefix}/_next/` },
      }
}

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
      getStyleLoader({
        isDevelopment: ctx.isDevelopment,
        assetPrefix: ctx.assetPrefix,
      })
    )
  }

  // Resolve CSS `@import`s and `url()`s
  loaders.push({
    loader: require.resolve('css-loader'),
    options: { importLoaders: 1 + preProcessors.length, sourceMap: true },
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
