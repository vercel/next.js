import curry from 'next/dist/compiled/lodash.curry'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { loader, plugin } from '../../helpers'
import { pipe } from '../../utils'
import type { ConfigurationContext, ConfigurationFn } from '../../utils'
import { getCssModuleLoader, getGlobalCssLoader } from './loaders'
import { getNextFontLoader } from './loaders/next-font'
import {
  getCustomDocumentError,
  getGlobalImportError,
  getGlobalModuleImportError,
  getLocalModuleImportError,
} from './messages'
import { getPostCssPlugins } from './plugins'
import { nonNullable } from '../../../../../lib/non-nullable'
import { WEBPACK_LAYERS } from '../../../../../lib/constants'

// RegExps for all Style Sheet variants
export const regexLikeCss = /\.(css|scss|sass)$/

// RegExps for Style Sheets
const regexCssGlobal = /(?<!\.module)\.css$/
const regexCssModules = /\.module\.css$/

// RegExps for Syntactically Awesome Style Sheets
const regexSassGlobal = /(?<!\.module)\.(scss|sass)$/
const regexSassModules = /\.module\.(scss|sass)$/

const APP_LAYER_RULE = {
  or: [
    WEBPACK_LAYERS.reactServerComponents,
    WEBPACK_LAYERS.serverSideRendering,
    WEBPACK_LAYERS.appPagesBrowser,
  ],
}

const PAGES_LAYER_RULE = {
  not: [
    WEBPACK_LAYERS.reactServerComponents,
    WEBPACK_LAYERS.serverSideRendering,
    WEBPACK_LAYERS.appPagesBrowser,
  ],
}

/**
 * Mark a rule as removable if built-in CSS support is disabled
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
         * @example
         * postcss.vendor.prefix('-moz-tab-size') //=> '-moz-'
         * postcss.vendor.prefix('tab-size')      //=> ''
         */
        prefix: function prefix(prop: string): string {
          const match = prop.match(/^(-\w+-)/)

          if (match) {
            return match[0]
          }

          return ''
        },

        /**
         * Returns the input string stripped of its vendor prefix.
         *
         * @example
         * postcss.vendor.unprefixed('-moz-tab-size') //=> 'tab-size'
         */
        unprefixed: function unprefixed(
          /**
           * String with or without vendor prefix.
           */
          prop: string
        ): string {
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
        sassOptions: {
          // The "fibers" option is not needed for Node.js 16+, but it's causing
          // problems for Node.js <= 14 users as you'll have to manually install
          // the `fibers` package:
          // https://github.com/webpack-contrib/sass-loader#:~:text=We%20automatically%20inject%20the%20fibers%20package
          // https://github.com/vercel/next.js/issues/45052
          // Since it's optional and not required, we'll disable it by default
          // to avoid the confusion.
          fibers: false,
          ...sassOptions,
        },
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

  const googleLoader = require.resolve(
    'next/dist/compiled/@next/font/google/loader'
  )
  const localLoader = require.resolve(
    'next/dist/compiled/@next/font/local/loader'
  )
  const nextFontLoaders: Array<[string | RegExp, string, any?]> = [
    [require.resolve('next/font/google/target.css'), googleLoader],
    [require.resolve('next/font/local/target.css'), localLoader],
    // TODO: remove this in the next major version
    [/node_modules[\\/]@next[\\/]font[\\/]google[\\/]target.css/, googleLoader],
    [/node_modules[\\/]@next[\\/]font[\\/]local[\\/]target.css/, localLoader],
  ]

  nextFontLoaders.forEach(([fontLoaderTarget, fontLoaderPath]) => {
    // Matches the resolved font loaders noop files to run next-font-loader
    fns.push(
      loader({
        oneOf: [
          markRemovable({
            sideEffects: false,
            test: fontLoaderTarget,
            use: getNextFontLoader(ctx, lazyPostCSSInitializer, fontLoaderPath),
          }),
        ],
      })
    )
  })

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

  const shouldIncludeExternalCSSImports =
    !!ctx.experimental.craCompat || !!ctx.transpilePackages

  // CSS modules & SASS modules support. They are allowed to be imported in anywhere.
  fns.push(
    // CSS Modules should never have side effects. This setting will
    // allow unused CSS to be removed from the production build.
    // We ensure this by disallowing `:global()` CSS at the top-level
    // via the `pure` mode in `css-loader`.
    loader({
      oneOf: [
        // For app dir, we need to match the specific app layer.
        ctx.hasAppDir
          ? markRemovable({
              sideEffects: false,
              test: regexCssModules,
              issuerLayer: APP_LAYER_RULE,
              use: [
                {
                  loader: require.resolve(
                    '../../../loaders/next-flight-css-loader'
                  ),
                  options: {
                    cssModules: true,
                  },
                },
                ...getCssModuleLoader(
                  { ...ctx, isAppDir: true },
                  lazyPostCSSInitializer
                ),
              ],
            })
          : null,
        markRemovable({
          sideEffects: false,
          test: regexCssModules,
          issuerLayer: PAGES_LAYER_RULE,
          use: getCssModuleLoader(
            { ...ctx, isAppDir: false },
            lazyPostCSSInitializer
          ),
        }),
      ].filter(nonNullable),
    }),
    // Opt-in support for Sass (using .scss or .sass extensions).
    // Sass Modules should never have side effects. This setting will
    // allow unused Sass to be removed from the production build.
    // We ensure this by disallowing `:global()` Sass at the top-level
    // via the `pure` mode in `css-loader`.
    loader({
      oneOf: [
        // For app dir, we need to match the specific app layer.
        ctx.hasAppDir
          ? markRemovable({
              sideEffects: false,
              test: regexSassModules,
              issuerLayer: APP_LAYER_RULE,
              use: [
                {
                  loader: require.resolve(
                    '../../../loaders/next-flight-css-loader'
                  ),
                  options: {
                    cssModules: true,
                  },
                },
                ...getCssModuleLoader(
                  { ...ctx, isAppDir: true },
                  lazyPostCSSInitializer,
                  sassPreprocessors
                ),
              ],
            })
          : null,
        markRemovable({
          sideEffects: false,
          test: regexSassModules,
          issuerLayer: PAGES_LAYER_RULE,
          use: getCssModuleLoader(
            { ...ctx, isAppDir: false },
            lazyPostCSSInitializer,
            sassPreprocessors
          ),
        }),
      ].filter(nonNullable),
    }),
    // Throw an error for CSS Modules used outside their supported scope
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

  // Global CSS and SASS support.
  if (ctx.isServer) {
    fns.push(
      loader({
        oneOf: [
          ctx.hasAppDir && !ctx.isProduction
            ? markRemovable({
                sideEffects: true,
                test: [regexCssGlobal, regexSassGlobal],
                issuerLayer: APP_LAYER_RULE,
                use: {
                  loader: require.resolve(
                    '../../../loaders/next-flight-css-loader'
                  ),
                  options: {
                    cssModules: false,
                  },
                },
              })
            : null,
          markRemovable({
            // CSS imports have side effects, even on the server side.
            sideEffects: true,
            test: [regexCssGlobal, regexSassGlobal],
            use: require.resolve('next/dist/compiled/ignore-loader'),
          }),
        ].filter(nonNullable),
      })
    )
  } else {
    // External CSS files are allowed to be loaded when any of the following is true:
    // - hasAppDir: all CSS files are allowed
    // - If the CSS file is located in `node_modules`
    // - If the CSS file is located in another package in a monorepo (outside of the current rootDir)
    // - If the issuer is pages/_app (matched later)
    const allowedPagesGlobalCSSPath = ctx.hasAppDir
      ? undefined
      : {
          and: [
            {
              or: [
                /node_modules/,
                {
                  not: [ctx.rootDirectory],
                },
              ],
            },
          ],
        }
    const allowedPagesGlobalCSSIssuer = ctx.hasAppDir
      ? undefined
      : shouldIncludeExternalCSSImports
      ? undefined
      : {
          and: [ctx.rootDirectory],
          not: [/node_modules/],
        }

    fns.push(
      loader({
        oneOf: [
          ...(ctx.hasAppDir
            ? [
                markRemovable({
                  sideEffects: true,
                  test: regexCssGlobal,
                  issuerLayer: APP_LAYER_RULE,
                  use: [
                    {
                      loader: require.resolve(
                        '../../../loaders/next-flight-css-loader'
                      ),
                      options: {
                        cssModules: false,
                      },
                    },
                    ...getGlobalCssLoader(
                      { ...ctx, isAppDir: true },
                      lazyPostCSSInitializer
                    ),
                  ],
                }),
                markRemovable({
                  sideEffects: true,
                  test: regexSassGlobal,
                  issuerLayer: APP_LAYER_RULE,
                  use: [
                    {
                      loader: require.resolve(
                        '../../../loaders/next-flight-css-loader'
                      ),
                      options: {
                        cssModules: false,
                      },
                    },
                    ...getGlobalCssLoader(
                      { ...ctx, isAppDir: true },
                      lazyPostCSSInitializer,
                      sassPreprocessors
                    ),
                  ],
                }),
              ]
            : []),
          markRemovable({
            sideEffects: true,
            test: regexCssGlobal,
            include: allowedPagesGlobalCSSPath,
            issuer: allowedPagesGlobalCSSIssuer,
            issuerLayer: PAGES_LAYER_RULE,
            use: getGlobalCssLoader(
              { ...ctx, isAppDir: false },
              lazyPostCSSInitializer
            ),
          }),
          markRemovable({
            sideEffects: true,
            test: regexSassGlobal,
            include: allowedPagesGlobalCSSPath,
            issuer: allowedPagesGlobalCSSIssuer,
            issuerLayer: PAGES_LAYER_RULE,
            use: getGlobalCssLoader(
              { ...ctx, isAppDir: false },
              lazyPostCSSInitializer,
              sassPreprocessors
            ),
          }),
        ].filter(nonNullable),
      })
    )

    if (ctx.customAppFile) {
      fns.push(
        loader({
          oneOf: [
            markRemovable({
              sideEffects: true,
              test: regexCssGlobal,
              issuer: { and: [ctx.customAppFile] },
              use: getGlobalCssLoader(
                { ...ctx, isAppDir: false },
                lazyPostCSSInitializer
              ),
            }),
          ],
        }),
        loader({
          oneOf: [
            markRemovable({
              sideEffects: true,
              test: regexSassGlobal,
              issuer: { and: [ctx.customAppFile] },
              use: getGlobalCssLoader(
                { ...ctx, isAppDir: false },
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
  if (!shouldIncludeExternalCSSImports) {
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
          issuer: ctx.hasAppDir
            ? {
                // If it's inside the app dir, but not importing from a layout file,
                // throw an error.
                and: [ctx.rootDirectory],
                not: [/layout\.(js|mjs|jsx|ts|tsx)$/],
              }
            : undefined,
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

  // Enable full mini-css-extract-plugin hmr for prod mode pages or app dir
  if (ctx.isClient && (ctx.isProduction || ctx.hasAppDir)) {
    // Extract CSS as CSS file(s) in the client-side production bundle.
    const MiniCssExtractPlugin =
      require('../../../plugins/mini-css-extract-plugin').default
    fns.push(
      plugin(
        // @ts-ignore webpack 5 compat
        new MiniCssExtractPlugin({
          filename: ctx.isProduction
            ? 'static/css/[contenthash].css'
            : 'static/css/[name].css',
          chunkFilename: ctx.isProduction
            ? 'static/css/[contenthash].css'
            : 'static/css/[name].css',
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
