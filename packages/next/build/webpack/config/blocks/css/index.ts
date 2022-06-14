import curry from 'next/dist/compiled/lodash.curry'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { loader, plugin } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getCssModuleLoader, getGlobalCssLoader } from './loaders'
import {
  getCustomDocumentError,
  getGlobalImportError,
  getGlobalModuleImportError,
  getLocalModuleImportError,
} from './messages'
import { getPostCssPlugins } from './plugins'

// RegExps for all Style Sheet variants
export const regexLikeCss = /\.(css|scss|sass)$/

// RegExps for Style Sheets
const regexCssGlobal = /(?<!\.module)\.css$/
const regexCssModules = /\.module\.css$/

// RegExps for Syntactically Awesome Style Sheets
const regexSassGlobal = /(?<!\.module)\.(scss|sass)$/
const regexSassModules = /\.module\.(scss|sass)$/

/**
 * Mark a rule as removable if built-in CSS support is disabled
 *
 * @param {webpack.RuleSetRule} r the rule to mark
 *
 * @returns {webpack.RuleSetRule} the marked rule
 */
function markRemovable(r: webpack.RuleSetRule): webpack.RuleSetRule {
  Object.defineProperty(r, Symbol.for('__next_css_remove'), {
    enumerable: false,
    value: true,
  })
  return r
}

let postcssInstancePromise: Promise<any>
export async function lazyPostCSS(
  rootDirectory: string,
  supportedBrowsers: string[] | undefined,
  disablePostcssPresetEnv: boolean | undefined
) {
  if (!postcssInstancePromise) {
    postcssInstancePromise = (async () => {
      const postcss = require('postcss')
      // @ts-ignore backwards compat
      postcss.plugin = function postcssPlugin(name, initializer) {
        function creator(...args: any) {
          let transformer = initializer(...args)
          transformer.postcssPlugin = name
          // transformer.postcssVersion = new Processor().version
          return transformer
        }

        let cache: any
        Object.defineProperty(creator, 'postcss', {
          get() {
            if (!cache) cache = creator()
            return cache
          },
        })

        creator.process = function (
          css: any,
          processOpts: any,
          pluginOpts: any
        ) {
          return postcss([creator(pluginOpts)]).process(css, processOpts)
        }

        return creator
      }

      // @ts-ignore backwards compat
      postcss.vendor = {
        /**
         * Returns the vendor prefix extracted from an input string.
         *
         * @param {string} prop String with or without vendor prefix.
         *
         * @return {string} vendor prefix or empty string
         *
         * @example
         * postcss.vendor.prefix('-moz-tab-size') //=> '-moz-'
         * postcss.vendor.prefix('tab-size')      //=> ''
         */
        prefix: function prefix(prop: any) {
          const match = prop.match(/^(-\w+-)/)

          if (match) {
            return match[0]
          }

          return ''
        },

        /**
         * Returns the input string stripped of its vendor prefix.
         *
         * @param {string} prop String with or without vendor prefix.
         *
         * @return {string} String name without vendor prefixes.
         *
         * @example
         * postcss.vendor.unprefixed('-moz-tab-size') //=> 'tab-size'
         */
        unprefixed: function unprefixed(prop: any) {
          return prop.replace(/^-\w+-/, '')
        },
      }

      const postCssPlugins = await getPostCssPlugins(
        rootDirectory,
        supportedBrowsers,
        disablePostcssPresetEnv
      )

      return {
        postcss,
        postcssWithPlugins: postcss(postCssPlugins),
      }
    })()
  }

  return postcssInstancePromise
}

export const css = curry(async function css(
  ctx: ConfigurationContext,
  config: webpack.Configuration
) {
  const {
    prependData: sassPrependData,
    additionalData: sassAdditionalData,
    ...sassOptions
  } = ctx.sassOptions

  const lazyPostCSSInitializer = () =>
    lazyPostCSS(
      ctx.rootDirectory,
      ctx.supportedBrowsers,
      ctx.experimental.disablePostcssPresetEnv
    )

  const sassPreprocessors: webpack.RuleSetUseItem[] = [
    // First, process files with `sass-loader`: this inlines content, and
    // compiles away the proprietary syntax.
    {
      loader: require.resolve('next/dist/compiled/sass-loader'),
      options: {
        // Source maps are required so that `resolve-url-loader` can locate
        // files original to their source directory.
        sourceMap: true,
        sassOptions,
        additionalData: sassPrependData || sassAdditionalData,
      },
    },
    // Then, `sass-loader` will have passed-through CSS imports as-is instead
    // of inlining them. Because they were inlined, the paths are no longer
    // correct.
    // To fix this, we use `resolve-url-loader` to rewrite the CSS
    // imports to real file paths.
    {
      loader: require.resolve('../../../loaders/resolve-url-loader/index'),
      options: {
        postcss: lazyPostCSSInitializer,
        // Source maps are not required here, but we may as well emit
        // them.
        sourceMap: true,
      },
    },
  ]

  const fns: ConfigurationFn[] = []

  // CSS cannot be imported in _document. This comes before everything because
  // global CSS nor CSS modules work in said file.
  fns.push(
    loader({
      oneOf: [
        markRemovable({
          test: regexLikeCss,
          // Use a loose regex so we don't have to crawl the file system to
          // find the real file name (if present).
          issuer: /pages[\\/]_document\./,
          use: {
            loader: 'error-loader',
            options: {
              reason: getCustomDocumentError(),
            },
          },
        }),
      ],
    })
  )

  // CSS Modules support must be enabled on the server and client so the class
  // names are available for SSR or Prerendering.
  fns.push(
    loader({
      oneOf: [
        markRemovable({
          // CSS Modules should never have side effects. This setting will
          // allow unused CSS to be removed from the production build.
          // We ensure this by disallowing `:global()` CSS at the top-level
          // via the `pure` mode in `css-loader`.
          sideEffects: false,
          // CSS Modules are activated via this specific extension.
          test: regexCssModules,
          // CSS Modules are only supported in the user's application. We're
          // not yet allowing CSS imports _within_ `node_modules`.
          issuer: {
            and: [ctx.rootDirectory],
            not: [/node_modules/],
          },
          use: getCssModuleLoader(ctx, lazyPostCSSInitializer),
        }),
      ],
    })
  )
  fns.push(
    loader({
      oneOf: [
        // Opt-in support for Sass (using .scss or .sass extensions).
        markRemovable({
          // Sass Modules should never have side effects. This setting will
          // allow unused Sass to be removed from the production build.
          // We ensure this by disallowing `:global()` Sass at the top-level
          // via the `pure` mode in `css-loader`.
          sideEffects: false,
          // Sass Modules are activated via this specific extension.
          test: regexSassModules,
          // Sass Modules are only supported in the user's application. We're
          // not yet allowing Sass imports _within_ `node_modules`.
          issuer: {
            and: [ctx.rootDirectory],
            not: [/node_modules/],
          },
          use: getCssModuleLoader(
            ctx,
            lazyPostCSSInitializer,
            sassPreprocessors
          ),
        }),
      ],
    })
  )

  // Throw an error for CSS Modules used outside their supported scope
  fns.push(
    loader({
      oneOf: [
        markRemovable({
          test: [regexCssModules, regexSassModules],
          use: {
            loader: 'error-loader',
            options: {
              reason: getLocalModuleImportError(),
            },
          },
        }),
      ],
    })
  )

  if (ctx.isServer) {
    fns.push(
      loader({
        oneOf: [
          markRemovable({
            test: [regexCssGlobal, regexSassGlobal],
            use: require.resolve('next/dist/compiled/ignore-loader'),
          }),
        ],
      })
    )
  } else {
    fns.push(
      loader({
        oneOf: [
          markRemovable({
            // A global CSS import always has side effects. Webpack will tree
            // shake the CSS without this option if the issuer claims to have
            // no side-effects.
            // See https://github.com/webpack/webpack/issues/6571
            sideEffects: true,
            test: regexCssGlobal,
            // We only allow Global CSS to be imported anywhere in the
            // application if it comes from node_modules. This is a best-effort
            // heuristic that makes a safety trade-off for better
            // interoperability with npm packages that require CSS. Without
            // this ability, the component's CSS would have to be included for
            // the entire app instead of specific page where it's required.
            include: { and: [/node_modules/] },
            // Global CSS is only supported in the user's application, not in
            // node_modules.
            issuer: ctx.experimental.craCompat
              ? undefined
              : {
                  and: [ctx.rootDirectory],
                  not: [/node_modules/],
                },
            use: getGlobalCssLoader(ctx, lazyPostCSSInitializer),
          }),
        ],
      })
    )

    if (ctx.customAppFile) {
      fns.push(
        loader({
          oneOf: [
            markRemovable({
              // A global CSS import always has side effects. Webpack will tree
              // shake the CSS without this option if the issuer claims to have
              // no side-effects.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
              test: regexCssGlobal,
              issuer: { and: [ctx.customAppFile] },
              use: getGlobalCssLoader(ctx, lazyPostCSSInitializer),
            }),
          ],
        })
      )
      fns.push(
        loader({
          oneOf: [
            markRemovable({
              // A global Sass import always has side effects. Webpack will tree
              // shake the Sass without this option if the issuer claims to have
              // no side-effects.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
              test: regexSassGlobal,
              issuer: { and: [ctx.customAppFile] },
              use: getGlobalCssLoader(
                ctx,
                lazyPostCSSInitializer,
                sassPreprocessors
              ),
            }),
          ],
        })
      )
    }
  }

  // Throw an error for Global CSS used inside of `node_modules`
  if (!ctx.experimental.craCompat) {
    fns.push(
      loader({
        oneOf: [
          markRemovable({
            test: [regexCssGlobal, regexSassGlobal],
            issuer: { and: [/node_modules/] },
            use: {
              loader: 'error-loader',
              options: {
                reason: getGlobalModuleImportError(),
              },
            },
          }),
        ],
      })
    )
  }

  // Throw an error for Global CSS used outside of our custom <App> file
  fns.push(
    loader({
      oneOf: [
        markRemovable({
          test: [regexCssGlobal, regexSassGlobal],
          use: {
            loader: 'error-loader',
            options: {
              reason: getGlobalImportError(),
            },
          },
        }),
      ],
    })
  )

  if (ctx.isClient) {
    // Automatically transform references to files (i.e. url()) into URLs
    // e.g. url(./logo.svg)
    fns.push(
      loader({
        oneOf: [
          markRemovable({
            // This should only be applied to CSS files
            issuer: regexLikeCss,
            // Exclude extensions that webpack handles by default
            exclude: [
              /\.(js|mjs|jsx|ts|tsx)$/,
              /\.html$/,
              /\.json$/,
              /\.webpack\[[^\]]+\]$/,
            ],
            // `asset/resource` always emits a URL reference, where `asset`
            // might inline the asset as a data URI
            type: 'asset/resource',
          }),
        ],
      })
    )
  }

  if (ctx.isClient && ctx.isProduction) {
    // Extract CSS as CSS file(s) in the client-side production bundle.
    const MiniCssExtractPlugin =
      require('../../../plugins/mini-css-extract-plugin').default
    fns.push(
      plugin(
        // @ts-ignore webpack 5 compat
        new MiniCssExtractPlugin({
          filename: 'static/css/[contenthash].css',
          chunkFilename: 'static/css/[contenthash].css',
          // Next.js guarantees that CSS order "doesn't matter", due to imposed
          // restrictions:
          // 1. Global CSS can only be defined in a single entrypoint (_app)
          // 2. CSS Modules generate scoped class names by default and cannot
          //    include Global CSS (:global() selector).
          //
          // While not a perfect guarantee (e.g. liberal use of `:global()`
          // selector), this assumption is required to code-split CSS.
          //
          // If this warning were to trigger, it'd be unactionable by the user,
          // but likely not valid -- so we disable it.
          ignoreOrder: true,
        })
      )
    )
  }

  const fn = pipe(...fns)
  return fn(config)
})
