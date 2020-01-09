import curry from 'lodash.curry'
import path from 'path'
import webpack, { Configuration, RuleSetRule } from 'webpack'
import MiniCssExtractPlugin from '../../../plugins/mini-css-extract-plugin'
import { loader } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getCssModuleLocalIdent } from './getCssModuleLocalIdent'
import {
  getGlobalImportError,
  getGlobalModuleImportError,
  getLocalModuleImportError,
} from './messages'
import { getPostCssPlugins } from './plugins'

function getClientStyleLoader({
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
        options: { publicPath: `${assetPrefix}/_next/` },
      }
}

export async function __overrideCssConfiguration(
  rootDirectory: string,
  isProduction: boolean,
  config: Configuration
) {
  const postCssPlugins = await getPostCssPlugins(rootDirectory, isProduction)

  function patch(rule: RuleSetRule) {
    if (
      rule.options &&
      typeof rule.options === 'object' &&
      rule.options['ident'] === '__nextjs_postcss'
    ) {
      rule.options.plugins = postCssPlugins
    } else if (Array.isArray(rule.oneOf)) {
      rule.oneOf.forEach(patch)
    } else if (Array.isArray(rule.use)) {
      rule.use.forEach(u => {
        if (typeof u === 'object') {
          patch(u)
        }
      })
    }
  }

  // TODO: remove this rule, ESLint bug
  // eslint-disable-next-line no-unused-expressions
  config.module?.rules?.forEach(entry => {
    patch(entry)
  })
}

export const css = curry(async function css(
  enabled: boolean,
  ctx: ConfigurationContext,
  config: Configuration
) {
  if (!enabled) {
    return config
  }

  const fns: ConfigurationFn[] = [
    loader({
      oneOf: [
        {
          // Impossible regex expression
          test: /a^/,
          loader: 'noop-loader',
          options: { __next_css_remove: true },
        },
      ],
    }),
  ]

  const postCssPlugins = await getPostCssPlugins(
    ctx.rootDirectory,
    ctx.isProduction,
    // TODO: In the future, we should stop supporting old CSS setups and
    // unconditionally inject ours. When that happens, we should remove this
    // function argument.
    true
  )
  // CSS Modules support must be enabled on the server and client so the class
  // names are availble for SSR or Prerendering.
  fns.push(
    loader({
      oneOf: [
        {
          // CSS Modules should never have side effects. This setting will
          // allow unused CSS to be removed from the production build.
          // We ensure this by disallowing `:global()` CSS at the top-level
          // via the `pure` mode in `css-loader`.
          sideEffects: false,
          // CSS Modules are activated via this specific extension.
          test: /\.module\.css$/,
          // CSS Modules are only supported in the user's application. We're
          // not yet allowing CSS imports _within_ `node_modules`.
          issuer: {
            include: [ctx.rootDirectory],
            exclude: /node_modules/,
          },

          use: ([
            // Add appropriate development more or production mode style
            // loader
            ctx.isClient &&
              getClientStyleLoader({
                isDevelopment: ctx.isDevelopment,
                assetPrefix: ctx.assetPrefix,
              }),

            // Resolve CSS `@import`s and `url()`s
            {
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
            },

            // Compile CSS
            {
              loader: require.resolve('postcss-loader'),
              options: {
                ident: '__nextjs_postcss',
                plugins: postCssPlugins,
                sourceMap: true,
              },
            },
          ] as webpack.RuleSetUseItem[]).filter(Boolean),
        },
      ],
    })
  )

  // Throw an error for CSS Modules used outside their supported scope
  fns.push(
    loader({
      oneOf: [
        {
          test: /\.module\.css$/,
          use: {
            loader: 'error-loader',
            options: {
              reason: getLocalModuleImportError(),
            },
          },
        },
      ],
    })
  )

  if (ctx.isServer) {
    fns.push(
      loader({
        oneOf: [{ test: /\.css$/, use: require.resolve('ignore-loader') }],
      })
    )
  } else if (ctx.customAppFile) {
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
              getClientStyleLoader({
                isDevelopment: ctx.isDevelopment,
                assetPrefix: ctx.assetPrefix,
              }),

              // Resolve CSS `@import`s and `url()`s
              {
                loader: require.resolve('css-loader'),
                options: { importLoaders: 1, sourceMap: true },
              },

              // Compile CSS
              {
                loader: require.resolve('postcss-loader'),
                options: {
                  ident: '__nextjs_postcss',
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

  // Throw an error for Global CSS used inside of `node_modules`
  fns.push(
    loader({
      oneOf: [
        {
          test: /\.css$/,
          issuer: { include: [/node_modules/] },
          use: {
            loader: 'error-loader',
            options: {
              reason: getGlobalModuleImportError(),
            },
          },
        },
      ],
    })
  )

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

  if (ctx.isClient) {
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
  }

  const fn = pipe(...fns)
  return fn(config)
})
