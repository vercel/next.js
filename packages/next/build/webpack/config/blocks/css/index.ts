import curry from 'lodash.curry'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import path from 'path'
import { Configuration } from 'webpack'
import { loader } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getGlobalImportError } from './messages'
import { getPostCssPlugins } from './plugins'
import webpack from 'webpack'

function getStyleLoader({
  isDevelopment,
}: {
  isDevelopment: boolean
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
          insert: function(element: Node) {
            // These elements should always exist. If they do not,
            // this code should fail.
            var anchorElement = document.querySelector(
              '#__next_css__DO_NOT_USE__'
            )!
            var parentNode = anchorElement.parentNode! // Normally <head>

            // Each style tag should be placed right before our
            // anchor. By inserting before and not after, we do not
            // need to track the last inserted element.
            parentNode.insertBefore(element, anchorElement)

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
        options: {},
      }
}

export const css = curry(async function css(
  enabled: boolean,
  ctx: ConfigurationContext,
  config: Configuration
) {
  if (!enabled) {
    return config
  }

  const fns: ConfigurationFn[] = []

  if (ctx.isServer) {
    fns.push(
      loader({
        oneOf: [{ test: /\.css$/, use: require.resolve('ignore-loader') }],
      })
    )
  } else if (ctx.customAppFile) {
    const postCssPlugins = await getPostCssPlugins(ctx.rootDirectory)
    fns.push(
      loader({
        oneOf: [
          {
            // A global CSS import always has side effects. Webpack will tree
            // shake the CSS without this option if the issuer claims to have
            // no side-effects.
            // See https://github.com/webpack/webpack/issues/6571
            sideEffects: true,
            test: /\.css$/,
            issuer: { include: ctx.customAppFile },

            use: [
              // Add appropriate development more or production mode style
              // loader
              getStyleLoader({ isDevelopment: ctx.isDevelopment }),

              // Resolve CSS `@import`s and `url()`s
              {
                loader: require.resolve('css-loader'),
                options: { importLoaders: 1, sourceMap: true },
              },

              // Compile CSS
              {
                loader: require.resolve('postcss-loader'),
                options: {
                  ident: 'postcss',
                  plugins: postCssPlugins,
                  sourceMap: true,
                },
              },
            ],
          },
        ],
      })
    )
  }

  // Throw an error for Global CSS used outside of our custom <App> file
  fns.push(
    loader({
      oneOf: [
        {
          test: /\.css$/,
          use: {
            loader: 'error-loader',
            options: {
              reason: getGlobalImportError(
                ctx.customAppFile &&
                  path.relative(ctx.rootDirectory, ctx.customAppFile)
              ),
            },
          },
        },
      ],
    })
  )

  // Automatically transform references to files (i.e. url()) into URLs
  // e.g. url(./logo.svg)
  fns.push(
    loader({
      oneOf: [
        {
          // This should only be applied to CSS files
          issuer: { test: /\.css$/ },
          // Exclude extensions that webpack handles by default
          exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
          use: {
            // `file-loader` always emits a URL reference, where `url-loader`
            // might inline the asset as a data URI
            loader: require.resolve('file-loader'),
            options: {
              // Hash the file for immutable cacheability
              name: 'static/media/[name].[hash].[ext]',
            },
          },
        },
      ],
    })
  )

  const fn = pipe(...fns)
  return fn(config)
})
