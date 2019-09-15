import crypto from 'crypto'
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'
import path from 'path'
// @ts-ignore: Currently missing types
import PnpWebpackPlugin from 'pnp-webpack-plugin'
import webpack from 'webpack'

import {
  DOT_NEXT_ALIAS,
  NEXT_PROJECT_ROOT,
  NEXT_PROJECT_ROOT_DIST_CLIENT,
  PAGES_DIR_ALIAS,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { resolveRequest } from '../lib/resolve-request'
import {
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
  SERVERLESS_DIRECTORY,
} from '../next-server/lib/constants'
import { WebpackEntrypoints } from './entries'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import { ChunkGraphPlugin } from './webpack/plugins/chunk-graph-plugin'
import ChunkNamesPlugin from './webpack/plugins/chunk-names-plugin'
import { importAutoDllPlugin } from './webpack/plugins/dll-import'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import NextEsmPlugin from './webpack/plugins/next-esm-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import NextJsSSRModuleCachePlugin from './webpack/plugins/nextjs-ssr-module-cache'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
// @ts-ignore: JS file
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import { TerserPlugin } from './webpack/plugins/terser-webpack-plugin/src/index'

type ExcludesFalse = <T>(x: T | false) => x is T

const escapePathVariables = (value: any) => {
  return typeof value === 'string'
    ? value.replace(/\[(\\*[\w:]+\\*)\]/gi, '[\\$1\\]')
    : value
}

export default async function getBaseWebpackConfig(
  dir: string,
  {
    dev = false,
    isServer = false,
    buildId,
    config,
    target = 'server',
    entrypoints,
    tracer,
  }: {
    tracer?: any
    dev?: boolean
    isServer?: boolean
    buildId: string
    config: any
    target?: string
    entrypoints: WebpackEntrypoints
  }
): Promise<webpack.Configuration> {
  const distDir = path.join(dir, config.distDir)
  const defaultLoaders = {
    babel: {
      loader: 'next-babel-loader',
      options: {
        isServer,
        hasModern: !!config.experimental.modern,
        distDir,
        cwd: dir,
        cache: true,
      },
    },
    // Backwards compat
    hotSelfAccept: {
      loader: 'noop-loader',
    },
  }

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter(p => !!p)

  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  // Intentionally not using isTargetLikeServerless helper
  const isLikeServerless = isServerless || isServerlessTrace

  const outputDir = isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  const outputPath = path.join(distDir, isServer ? outputDir : '')
  const totalPages = Object.keys(entrypoints).length
  const clientEntries = !isServer
    ? {
        // Backwards compatibility
        'main.js': [],
        [CLIENT_STATIC_FILES_RUNTIME_MAIN]:
          `.${path.sep}` +
          path.relative(
            dir,
            path.join(
              NEXT_PROJECT_ROOT_DIST_CLIENT,
              dev ? `next-dev.js` : 'next.js'
            )
          ),
      }
    : undefined

  let typeScriptPath
  try {
    typeScriptPath = resolveRequest('typescript', `${dir}/`)
  } catch (_) {}
  const tsConfigPath = path.join(dir, 'tsconfig.json')
  const useTypeScript = Boolean(
    typeScriptPath && (await fileExists(tsConfigPath))
  )

  const resolveConfig = {
    // Disable .mjs for node_modules bundling
    extensions: isServer
      ? [
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
          '.js',
          '.mjs',
          '.jsx',
          '.json',
          '.wasm',
        ]
      : [
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
          '.mjs',
          '.js',
          '.jsx',
          '.json',
          '.wasm',
        ],
    modules: [
      'node_modules',
      ...nodePathList, // Support for NODE_PATH environment variable
    ],
    alias: {
      // These aliases make sure the wrapper module is not included in the bundles
      // Which makes bundles slightly smaller, but also skips parsing a module that we know will result in this alias
      'next/head': 'next/dist/next-server/lib/head.js',
      'next/router': 'next/dist/client/router.js',
      'next/config': 'next/dist/next-server/lib/runtime-config.js',
      'next/dynamic': 'next/dist/next-server/lib/dynamic.js',
      next: NEXT_PROJECT_ROOT,
      [PAGES_DIR_ALIAS]: path.join(dir, 'pages'),
      [DOT_NEXT_ALIAS]: distDir,
    },
    mainFields: isServer ? ['main', 'module'] : ['browser', 'module', 'main'],
    plugins: [PnpWebpackPlugin],
  }

  const webpackMode = dev ? 'development' : 'production'

  const terserPluginConfig = {
    parallel: true,
    sourceMap: false,
    cache: true,
    cpus: config.experimental.cpus,
    distDir: distDir,
  }
  const terserOptions = {
    parse: {
      ecma: 8,
    },
    compress: {
      ecma: 5,
      warnings: false,
      // The following two options are known to break valid JavaScript code
      comparisons: false,
      inline: 2, // https://github.com/zeit/next.js/issues/7178#issuecomment-493048965
    },
    mangle: { safari10: true },
    output: {
      ecma: 5,
      safari10: true,
      comments: false,
      // Fixes usage of Emoji and certain Regex
      ascii_only: true,
    },
  }

  const devtool = dev ? 'cheap-module-source-map' : false

  // Contains various versions of the Webpack SplitChunksPlugin used in different build types
  const splitChunksConfigs: {
    [propName: string]: webpack.Options.SplitChunksOptions
  } = {
    dev: {
      cacheGroups: {
        default: false,
        vendors: false,
      },
    },
    prod: {
      chunks: 'all',
      cacheGroups: {
        default: false,
        vendors: false,
        commons: {
          name: 'commons',
          chunks: 'all',
          minChunks: totalPages > 2 ? totalPages * 0.5 : 2,
        },
        react: {
          name: 'commons',
          chunks: 'all',
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
        },
      },
    },
    prodGranular: {
      chunks: 'initial',
      cacheGroups: {
        default: false,
        vendors: false,
        framework: {
          // Framework chunk applies to modules in dynamic chunks, unlike shared chunks
          // TODO(atcastle): Analyze if other cache groups should be set to 'all' as well
          chunks: 'all',
          name: 'framework',
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types)[\\/]/,
          priority: 40,
        },
        lib: {
          test(module: { size: Function; identifier: Function }): boolean {
            return (
              module.size() > 160000 &&
              /node_modules[/\\]/.test(module.identifier())
            )
          },
          name(module: { libIdent: Function }): string {
            return crypto
              .createHash('sha1')
              .update(module.libIdent({ context: dir }))
              .digest('hex')
              .substring(0, 8)
          },
          priority: 30,
          minChunks: 1,
          reuseExistingChunk: true,
        },
        commons: {
          name: 'commons',
          minChunks: totalPages,
          priority: 20,
        },
        shared: {
          name(module, chunks) {
            return crypto
              .createHash('sha1')
              .update(
                chunks.reduce(
                  (acc: string, chunk: webpack.compilation.Chunk) => {
                    return acc + chunk.name
                  },
                  ''
                )
              )
              .digest('hex')
          },
          priority: 10,
          minChunks: 2,
          reuseExistingChunk: true,
        },
      },
      maxInitialRequests: 20,
    },
  }

  // Select appropriate SplitChunksPlugin config for this build
  let splitChunksConfig: webpack.Options.SplitChunksOptions
  if (dev) {
    splitChunksConfig = splitChunksConfigs.dev
  } else {
    splitChunksConfig = config.experimental.granularChunks
      ? splitChunksConfigs.prodGranular
      : splitChunksConfigs.prod
  }

  const crossOrigin =
    !config.crossOrigin && config.experimental.modern
      ? 'anonymous'
      : config.crossOrigin

  let webpackConfig: webpack.Configuration = {
    devtool,
    mode: webpackMode,
    name: isServer ? 'server' : 'client',
    target: isServer ? 'node' : 'web',
    externals: !isServer
      ? undefined
      : !isServerless
      ? [
          (context, request, callback) => {
            const notExternalModules = [
              'next/app',
              'next/document',
              'next/link',
              'next/error',
              'string-hash',
              'next/constants',
            ]

            if (notExternalModules.indexOf(request) !== -1) {
              return callback()
            }

            // Resolve the import with the webpack provided context, this
            // ensures we're resolving the correct version when multiple
            // exist.
            let res
            try {
              res = resolveRequest(request, `${context}/`)
            } catch (err) {
              // This is a special case for the Next.js data experiment. This
              // will be removed in the future.
              // We're telling webpack to externalize a package that doesn't
              // exist because we know it won't ever be used at runtime.
              if (
                request === 'react-ssr-prepass' &&
                !config.experimental.ampBindInitData
              ) {
                if (
                  context.replace(/\\/g, '/').includes('next-server/server')
                ) {
                  return callback(undefined, `commonjs ${request}`)
                }
              }

              // If the request cannot be resolved, we need to tell webpack to
              // "bundle" it so that webpack shows an error (that it cannot be
              // resolved).
              return callback()
            }

            // Same as above, if the request cannot be resolved we need to have
            // webpack "bundle" it so it surfaces the not found error.
            if (!res) {
              return callback()
            }

            // Bundled Node.js code is relocated without its node_modules tree.
            // This means we need to make sure its request resolves to the same
            // package that'll be available at runtime. If it's not identical,
            // we need to bundle the code (even if it _should_ be external).
            let baseRes
            try {
              baseRes = resolveRequest(request, `${dir}/`)
            } catch (err) {}

            // Same as above: if the package, when required from the root,
            // would be different from what the real resolution would use, we
            // cannot externalize it.
            if (baseRes !== res) {
              return callback()
            }

            // Default pages have to be transpiled
            if (
              !res.match(/next[/\\]dist[/\\]next-server[/\\]/) &&
              (res.match(/next[/\\]dist[/\\]/) ||
                res.match(/node_modules[/\\]@babel[/\\]runtime[/\\]/) ||
                res.match(/node_modules[/\\]@babel[/\\]runtime-corejs2[/\\]/))
            ) {
              return callback()
            }

            // Webpack itself has to be compiled because it doesn't always use module relative paths
            if (
              res.match(/node_modules[/\\]webpack/) ||
              res.match(/node_modules[/\\]css-loader/)
            ) {
              return callback()
            }

            // Anything else that is standard JavaScript within `node_modules`
            // can be externalized.
            if (res.match(/node_modules[/\\].*\.js$/)) {
              return callback(undefined, `commonjs ${request}`)
            }

            // Default behavior: bundle the code!
            callback()
          },
        ]
      : [
          // When the 'serverless' target is used all node_modules will be compiled into the output bundles
          // So that the 'serverless' bundles have 0 runtime dependencies
          '@ampproject/toolbox-optimizer', // except this one
          (context, request, callback) => {
            if (
              request === 'react-ssr-prepass' &&
              !config.experimental.ampBindInitData
            ) {
              // if it's the Next.js' require mark it as external
              // since it's not used
              if (context.replace(/\\/g, '/').includes('next-server/server')) {
                return callback(undefined, `commonjs ${request}`)
              }
            }
            return callback()
          },
        ],
    optimization: {
      checkWasmTypes: false,
      nodeEnv: false,
      splitChunks: isServer ? false : splitChunksConfig,
      runtimeChunk: isServer
        ? undefined
        : { name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK },
      minimize: !(dev || isServer),
      minimizer: [
        new TerserPlugin({
          ...terserPluginConfig,
          terserOptions,
        }),
      ],
    },
    recordsPath: path.join(outputPath, 'records.json'),
    context: dir,
    // Kept as function to be backwards compatible
    entry: async () => {
      return {
        ...(clientEntries ? clientEntries : {}),
        ...entrypoints,
      }
    },
    output: {
      path: outputPath,
      filename: ({ chunk }: { chunk: { name: string } }) => {
        // Use `[name]-[contenthash].js` in production
        if (
          !dev &&
          (chunk.name === CLIENT_STATIC_FILES_RUNTIME_MAIN ||
            chunk.name === CLIENT_STATIC_FILES_RUNTIME_WEBPACK)
        ) {
          return chunk.name.replace(/\.js$/, '-[contenthash].js')
        }
        return '[name]'
      },
      libraryTarget: isServer ? 'commonjs2' : 'var',
      hotUpdateChunkFilename: 'static/webpack/[id].[hash].hot-update.js',
      hotUpdateMainFilename: 'static/webpack/[hash].hot-update.json',
      // This saves chunks with the name given via `import()`
      chunkFilename: isServer
        ? `${dev ? '[name]' : '[name].[contenthash]'}.js`
        : `static/chunks/${dev ? '[name]' : '[name].[contenthash]'}.js`,
      strictModuleExceptionHandling: true,
      crossOriginLoading: crossOrigin,
      futureEmitAssets: !dev,
      webassemblyModuleFilename: 'static/wasm/[modulehash].wasm',
    },
    performance: false,
    resolve: resolveConfig,
    resolveLoader: {
      // The loaders Next.js provides
      alias: [
        'emit-file-loader',
        'next-babel-loader',
        'next-client-pages-loader',
        'next-data-loader',
        'next-serverless-loader',
        'noop-loader',
      ].reduce(
        (alias, loader) => {
          // using multiple aliases to replace `resolveLoader.modules`
          alias[loader] = path.join(__dirname, 'webpack', 'loaders', loader)

          return alias
        },
        {} as Record<string, string>
      ),
      modules: [
        'node_modules',
        ...nodePathList, // Support for NODE_PATH environment variable
      ],
      plugins: [PnpWebpackPlugin],
    },
    // @ts-ignore this is filtered
    module: {
      strictExportPresence: true,
      rules: [
        config.experimental.ampBindInitData &&
          !isServer && {
            test: /\.(tsx|ts|js|mjs|jsx)$/,
            include: [path.join(dir, 'data')],
            use: 'next-data-loader',
          },
        {
          test: /\.(tsx|ts|js|mjs|jsx)$/,
          include: [
            dir,
            /next[\\/]dist[\\/]next-server[\\/]lib/,
            /next[\\/]dist[\\/]client/,
            /next[\\/]dist[\\/]pages/,
            /[\\/](strip-ansi|ansi-regex)[\\/]/,
          ],
          exclude: (path: string) => {
            if (
              /next[\\/]dist[\\/]next-server[\\/]lib/.test(path) ||
              /next[\\/]dist[\\/]client/.test(path) ||
              /next[\\/]dist[\\/]pages/.test(path) ||
              /[\\/](strip-ansi|ansi-regex)[\\/]/.test(path)
            ) {
              return false
            }

            return /node_modules/.test(path)
          },
          use: defaultLoaders.babel,
        },
      ].filter(Boolean),
    },
    plugins: [
      // This plugin makes sure `output.filename` is used for entry chunks
      new ChunkNamesPlugin(),
      new webpack.DefinePlugin({
        ...Object.keys(config.env).reduce((acc, key) => {
          if (/^(?:NODE_.+)|^(?:__.+)$/i.test(key)) {
            throw new Error(
              `The key "${key}" under "env" in next.config.js is not allowed. https://err.sh/zeit/next.js/env-key-not-allowed`
            )
          }

          return {
            ...acc,
            [`process.env.${key}`]: JSON.stringify(config.env[key]),
          }
        }, {}),
        'process.env.NODE_ENV': JSON.stringify(webpackMode),
        'process.crossOrigin': JSON.stringify(crossOrigin),
        'process.browser': JSON.stringify(!isServer),
        'process.env.__NEXT_TEST_MODE': JSON.stringify(
          process.env.__NEXT_TEST_MODE
        ),
        // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
        ...(dev && !isServer
          ? {
              'process.env.__NEXT_DIST_DIR': JSON.stringify(distDir),
            }
          : {}),
        'process.env.__NEXT_EXPORT_TRAILING_SLASH': JSON.stringify(
          config.exportTrailingSlash
        ),
        'process.env.__NEXT_MODERN_BUILD': JSON.stringify(
          config.experimental.modern && !dev
        ),
        'process.env.__NEXT_GRANULAR_CHUNKS': JSON.stringify(
          config.experimental.granularChunks && !dev
        ),
        'process.env.__NEXT_BUILD_INDICATOR': JSON.stringify(
          config.devIndicators.buildActivity
        ),
        'process.env.__NEXT_PRERENDER_INDICATOR': JSON.stringify(
          config.devIndicators.autoPrerender
        ),
        ...(isServer
          ? {
              // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
              // This is typically found in unmaintained modules from the
              // pre-webpack era (common in server-side code)
              'global.GENTLY': JSON.stringify(false),
            }
          : undefined),
      }),
      !isServer &&
        new ReactLoadablePlugin({
          filename: REACT_LOADABLE_MANIFEST,
        }),
      !isServer && new DropClientPage(),
      new ChunkGraphPlugin(buildId, {
        dir,
        distDir,
        isServer,
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      config.future.excludeDefaultMomentLocales &&
        new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
      ...(dev
        ? (() => {
            // Even though require.cache is server only we have to clear assets from both compilations
            // This is because the client compilation generates the build manifest that's used on the server side
            const {
              NextJsRequireCacheHotReloader,
            } = require('./webpack/plugins/nextjs-require-cache-hot-reloader')
            const {
              UnlinkRemovedPagesPlugin,
            } = require('./webpack/plugins/unlink-removed-pages-plugin')
            const devPlugins = [
              new UnlinkRemovedPagesPlugin(),
              new webpack.NoEmitOnErrorsPlugin(),
              new NextJsRequireCacheHotReloader(),
            ]

            if (!isServer) {
              const AutoDllPlugin = importAutoDllPlugin({ distDir })
              devPlugins.push(
                new AutoDllPlugin({
                  filename: '[name]_[hash].js',
                  path: './static/development/dll',
                  context: dir,
                  entry: {
                    dll: ['react', 'react-dom'],
                  },
                  config: {
                    devtool,
                    mode: webpackMode,
                    resolve: resolveConfig,
                  },
                })
              )
              devPlugins.push(new webpack.HotModuleReplacementPlugin())
            }

            return devPlugins
          })()
        : []),
      !dev && new webpack.HashedModuleIdsPlugin(),
      !dev &&
        new webpack.IgnorePlugin({
          checkResource: (resource: string) => {
            return /react-is/.test(resource)
          },
          checkContext: (context: string) => {
            return (
              /next-server[\\/]dist[\\/]/.test(context) ||
              /next[\\/]dist[\\/]/.test(context)
            )
          },
        }),
      isServerless && isServer && new ServerlessPlugin(),
      isServer && new PagesManifestPlugin(isLikeServerless),
      target === 'server' &&
        isServer &&
        new NextJsSSRModuleCachePlugin({ outputPath }),
      isServer && new NextJsSsrImportPlugin(),
      !isServer &&
        new BuildManifestPlugin({
          buildId,
          clientManifest: config.experimental.granularChunks,
          modern: config.experimental.modern,
        }),
      tracer &&
        new ProfilingPlugin({
          tracer,
        }),
      !isServer &&
        useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          typescript: typeScriptPath,
          async: dev,
          useTypescriptIncrementalApi: true,
          checkSyntacticErrors: true,
          tsconfig: tsConfigPath,
          reportFiles: ['**', '!**/__tests__/**', '!**/?(*.)(spec|test).*'],
          compilerOptions: { isolatedModules: true, noEmit: true },
          silent: true,
          formatter: 'codeframe',
        }),
      config.experimental.modern &&
        !isServer &&
        !dev &&
        new NextEsmPlugin({
          filename: (getFileName: Function | string) => (...args: any[]) => {
            const name =
              typeof getFileName === 'function'
                ? getFileName(...args)
                : getFileName

            return name.includes('.js')
              ? name.replace(/\.js$/, '.module.js')
              : escapePathVariables(
                  args[0].chunk.name.replace(/\.js$/, '.module.js')
                )
          },
          chunkFilename: (inputChunkName: string) =>
            inputChunkName.replace(/\.js$/, '.module.js'),
        }),
    ].filter((Boolean as any) as ExcludesFalse),
  }

  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {
      dir,
      dev,
      isServer,
      buildId,
      config,
      defaultLoaders,
      totalPages,
      webpack,
    })

    // @ts-ignore: Property 'then' does not exist on type 'Configuration'
    if (typeof webpackConfig.then === 'function') {
      console.warn(
        '> Promise returned in next config. https://err.sh/zeit/next.js/promise-in-next-config'
      )
    }
  }

  // check if using @zeit/next-typescript and show warning
  if (
    isServer &&
    webpackConfig.module &&
    Array.isArray(webpackConfig.module.rules)
  ) {
    let foundTsRule = false

    webpackConfig.module.rules = webpackConfig.module.rules.filter(
      (rule): boolean => {
        if (!(rule.test instanceof RegExp)) return true
        if ('noop.ts'.match(rule.test) && !'noop.js'.match(rule.test)) {
          // remove if it matches @zeit/next-typescript
          foundTsRule = rule.use === defaultLoaders.babel
          return !foundTsRule
        }
        return true
      }
    )

    if (foundTsRule) {
      console.warn(
        '\n@zeit/next-typescript is no longer needed since Next.js has built-in support for TypeScript now. Please remove it from your next.config.js and your .babelrc\n'
      )
    }
  }

  // Backwards compat for `main.js` entry key
  const originalEntry: any = webpackConfig.entry
  if (typeof originalEntry !== 'undefined') {
    webpackConfig.entry = async () => {
      const entry: WebpackEntrypoints =
        typeof originalEntry === 'function'
          ? await originalEntry()
          : originalEntry
      // Server compilation doesn't have main.js
      if (clientEntries && entry['main.js'] && entry['main.js'].length > 0) {
        const originalFile = clientEntries[CLIENT_STATIC_FILES_RUNTIME_MAIN]
        // @ts-ignore TODO: investigate type error
        entry[CLIENT_STATIC_FILES_RUNTIME_MAIN] = [
          ...entry['main.js'],
          originalFile,
        ]
      }
      delete entry['main.js']

      return entry
    }
  }

  if (!dev) {
    // @ts-ignore entry is always a function
    webpackConfig.entry = await webpackConfig.entry()
  }

  return webpackConfig
}
