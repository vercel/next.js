import { codeFrameColumns } from '@babel/code-frame'
import ReactRefreshWebpackPlugin from '@next/react-refresh-utils/ReactRefreshWebpackPlugin'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import chalk from 'next/dist/compiled/chalk'
import TerserPlugin from 'next/dist/compiled/terser-webpack-plugin'
import path from 'path'
import webpack from 'webpack'
import type { Configuration } from 'webpack'
import {
  DOT_NEXT_ALIAS,
  NEXT_PROJECT_ROOT,
  NEXT_PROJECT_ROOT_DIST_CLIENT,
  PAGES_DIR_ALIAS,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { resolveRequest } from '../lib/resolve-request'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import {
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  REACT_LOADABLE_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../next-server/lib/constants'
import { execOnce } from '../next-server/lib/utils'
import { findPageFile } from '../server/lib/find-page-file'
import { WebpackEntrypoints } from './entries'
import {
  collectPlugins,
  PluginMetaData,
  VALID_MIDDLEWARE,
} from './plugins/collect-plugins'
import { build as buildConfiguration } from './webpack/config'
import { __overrideCssConfiguration } from './webpack/config/blocks/css/overrideCssConfiguration'
import { pluginLoaderOptions } from './webpack/loaders/next-plugin-loader'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import ChunkNamesPlugin from './webpack/plugins/chunk-names-plugin'
import { CssMinimizerPlugin } from './webpack/plugins/css-minimizer-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import NextJsSSRModuleCachePlugin from './webpack/plugins/nextjs-ssr-module-cache'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import WebpackConformancePlugin, {
  DuplicatePolyfillsConformanceCheck,
  GranularChunksConformanceCheck,
  MinificationConformanceCheck,
  ReactSyncScriptsConformanceCheck,
} from './webpack/plugins/webpack-conformance-plugin'
import { WellKnownErrorsPlugin } from './webpack/plugins/wellknown-errors-plugin'

type ExcludesFalse = <T>(x: T | false) => x is T

const isWebpack5 = parseInt(webpack.version!) === 5

const escapePathVariables = (value: any) => {
  return typeof value === 'string'
    ? value.replace(/\[(\\*[\w:]+\\*)\]/gi, '[\\$1\\]')
    : value
}

const devtoolRevertWarning = execOnce((devtool: Configuration['devtool']) => {
  console.warn(
    chalk.yellow.bold('Warning: ') +
      chalk.bold(`Reverting webpack devtool to '${devtool}'.\n`) +
      'Changing the webpack devtool in development mode will cause severe performance regressions.\n' +
      'Read more: https://err.sh/next.js/improper-devtool'
  )
})

function parseJsonFile(filePath: string) {
  const JSON5 = require('next/dist/compiled/json5')
  const contents = readFileSync(filePath, 'utf8')

  // Special case an empty file
  if (contents.trim() === '') {
    return {}
  }

  try {
    return JSON5.parse(contents)
  } catch (err) {
    const codeFrame = codeFrameColumns(
      String(contents),
      { start: { line: err.lineNumber, column: err.columnNumber } },
      { message: err.message, highlightCode: true }
    )
    throw new Error(`Failed to parse "${filePath}":\n${codeFrame}`)
  }
}

function getOptimizedAliases(isServer: boolean): { [pkg: string]: string } {
  if (isServer) {
    return {}
  }

  const stubWindowFetch = path.join(__dirname, 'polyfills', 'fetch', 'index.js')
  const stubObjectAssign = path.join(__dirname, 'polyfills', 'object-assign.js')

  const shimAssign = path.join(__dirname, 'polyfills', 'object.assign')
  return Object.assign(
    {},
    {
      unfetch$: stubWindowFetch,
      'isomorphic-unfetch$': stubWindowFetch,
      'whatwg-fetch$': path.join(
        __dirname,
        'polyfills',
        'fetch',
        'whatwg-fetch.js'
      ),
    },
    {
      'object-assign$': stubObjectAssign,

      // Stub Package: object.assign
      'object.assign/auto': path.join(shimAssign, 'auto.js'),
      'object.assign/implementation': path.join(
        shimAssign,
        'implementation.js'
      ),
      'object.assign$': path.join(shimAssign, 'index.js'),
      'object.assign/polyfill': path.join(shimAssign, 'polyfill.js'),
      'object.assign/shim': path.join(shimAssign, 'shim.js'),

      // Replace: full URL polyfill with platform-based polyfill
      url: require.resolve('native-url'),
    }
  )
}

type ClientEntries = {
  [key: string]: string | string[]
}

export default async function getBaseWebpackConfig(
  dir: string,
  {
    buildId,
    config,
    dev = false,
    isServer = false,
    pagesDir,
    tracer,
    target = 'server',
    reactProductionProfiling = false,
    entrypoints,
  }: {
    buildId: string
    config: any
    dev?: boolean
    isServer?: boolean
    pagesDir: string
    target?: string
    tracer?: any
    reactProductionProfiling?: boolean
    entrypoints: WebpackEntrypoints
  }
): Promise<webpack.Configuration> {
  const productionBrowserSourceMaps =
    config.experimental.productionBrowserSourceMaps && !isServer
  let plugins: PluginMetaData[] = []
  let babelPresetPlugins: { dir: string; config: any }[] = []

  if (config.experimental.plugins) {
    plugins = await collectPlugins(dir, config.env, config.plugins)
    pluginLoaderOptions.plugins = plugins

    for (const plugin of plugins) {
      if (plugin.middleware.includes('babel-preset-build')) {
        babelPresetPlugins.push({
          dir: plugin.directory,
          config: plugin.config,
        })
      }
    }
  }

  const hasReactRefresh = dev && !isServer

  const distDir = path.join(dir, config.distDir)
  const defaultLoaders = {
    babel: {
      loader: 'next-babel-loader',
      options: {
        isServer,
        distDir,
        pagesDir,
        cwd: dir,
        cache: true,
        babelPresetPlugins,
        hasModern: !!config.experimental.modern,
        development: dev,
        hasReactRefresh,
      },
    },
    // Backwards compat
    hotSelfAccept: {
      loader: 'noop-loader',
    },
  }

  const babelIncludeRegexes: RegExp[] = [
    /next[\\/]dist[\\/]next-server[\\/]lib/,
    /next[\\/]dist[\\/]client/,
    /next[\\/]dist[\\/]pages/,
    /[\\/](strip-ansi|ansi-regex)[\\/]/,
    ...(config.experimental.plugins
      ? VALID_MIDDLEWARE.map((name) => new RegExp(`src(\\\\|/)${name}`))
      : []),
  ]

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  // Intentionally not using isTargetLikeServerless helper
  const isLikeServerless = isServerless || isServerlessTrace

  const outputDir = isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  const outputPath = path.join(distDir, isServer ? outputDir : '')
  const totalPages = Object.keys(entrypoints).length
  const clientEntries = !isServer
    ? ({
        // Backwards compatibility
        'main.js': [],
        [CLIENT_STATIC_FILES_RUNTIME_MAIN]:
          `./` +
          path
            .relative(
              dir,
              path.join(
                NEXT_PROJECT_ROOT_DIST_CLIENT,
                dev ? `next-dev.js` : 'next.js'
              )
            )
            .replace(/\\/g, '/'),
        [CLIENT_STATIC_FILES_RUNTIME_POLYFILLS]: path.join(
          NEXT_PROJECT_ROOT_DIST_CLIENT,
          'polyfills.js'
        ),
      } as ClientEntries)
    : undefined

  let typeScriptPath
  try {
    typeScriptPath = resolveRequest('typescript', `${dir}/`)
  } catch (_) {}
  const tsConfigPath = path.join(dir, 'tsconfig.json')
  const useTypeScript = Boolean(
    typeScriptPath && (await fileExists(tsConfigPath))
  )

  let jsConfig
  // jsconfig is a subset of tsconfig
  if (useTypeScript) {
    const ts = (await import(typeScriptPath)) as typeof import('typescript')
    const tsConfig = await getTypeScriptConfiguration(ts, tsConfigPath)
    jsConfig = { compilerOptions: tsConfig.options }
  }

  const jsConfigPath = path.join(dir, 'jsconfig.json')
  if (!useTypeScript && (await fileExists(jsConfigPath))) {
    jsConfig = parseJsonFile(jsConfigPath)
  }

  let resolvedBaseUrl
  if (jsConfig?.compilerOptions?.baseUrl) {
    resolvedBaseUrl = path.resolve(dir, jsConfig.compilerOptions.baseUrl)
  }

  function getReactProfilingInProduction() {
    if (reactProductionProfiling) {
      return {
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
      }
    }
  }

  const resolveConfig = {
    // Disable .mjs for node_modules bundling
    extensions: isServer
      ? [
          '.js',
          '.mjs',
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
          '.jsx',
          '.json',
          '.wasm',
        ]
      : [
          '.mjs',
          '.js',
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
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
      [PAGES_DIR_ALIAS]: pagesDir,
      [DOT_NEXT_ALIAS]: distDir,
      ...getOptimizedAliases(isServer),
      ...getReactProfilingInProduction(),
    },
    mainFields: isServer ? ['main', 'module'] : ['browser', 'module', 'main'],
    plugins: isWebpack5
      ? // webpack 5+ has the PnP resolver built-in by default:
        []
      : [require('pnp-webpack-plugin')],
  }

  const webpackMode = dev ? 'development' : 'production'

  const terserOptions: any = {
    parse: {
      ecma: 8,
    },
    compress: {
      ecma: 5,
      warnings: false,
      // The following two options are known to break valid JavaScript code
      comparisons: false,
      inline: 2, // https://github.com/vercel/next.js/issues/7178#issuecomment-493048965
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

  const isModuleCSS = (module: { type: string }): boolean => {
    return (
      // mini-css-extract-plugin
      module.type === `css/mini-extract` ||
      // extract-css-chunks-webpack-plugin (old)
      module.type === `css/extract-chunks` ||
      // extract-css-chunks-webpack-plugin (new)
      module.type === `css/extract-css-chunks`
    )
  }

  // Contains various versions of the Webpack SplitChunksPlugin used in different build types
  const splitChunksConfigs: {
    [propName: string]: webpack.Options.SplitChunksOptions
  } = {
    dev: {
      cacheGroups: {
        default: false,
        vendors: false,
        // In webpack 5 vendors was renamed to defaultVendors
        defaultVendors: false,
      },
    },
    prodGranular: {
      chunks: 'all',
      cacheGroups: {
        default: false,
        vendors: false,
        // In webpack 5 vendors was renamed to defaultVendors
        defaultVendors: false,
        framework: {
          chunks: 'all',
          name: 'framework',
          // This regex ignores nested copies of framework libraries so they're
          // bundled with their issuer.
          // https://github.com/vercel/next.js/pull/9012
          test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
          priority: 40,
          // Don't let webpack eliminate this chunk (prevents this chunk from
          // becoming a part of the commons chunk)
          enforce: true,
        },
        lib: {
          test(module: { size: Function; identifier: Function }): boolean {
            return (
              module.size() > 160000 &&
              /node_modules[/\\]/.test(module.identifier())
            )
          },
          name(module: {
            type: string
            libIdent?: Function
            updateHash: (hash: crypto.Hash) => void
          }): string {
            const hash = crypto.createHash('sha1')
            if (isModuleCSS(module)) {
              module.updateHash(hash)
            } else {
              if (!module.libIdent) {
                throw new Error(
                  `Encountered unknown module type: ${module.type}. Please open an issue.`
                )
              }

              hash.update(module.libIdent({ context: dir }))
            }

            return hash.digest('hex').substring(0, 8)
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
            return (
              crypto
                .createHash('sha1')
                .update(
                  chunks.reduce(
                    (acc: string, chunk: webpack.compilation.Chunk) => {
                      return acc + chunk.name
                    },
                    ''
                  )
                )
                .digest('hex') + (isModuleCSS(module) ? '_CSS' : '')
            )
          },
          priority: 10,
          minChunks: 2,
          reuseExistingChunk: true,
        },
      },
      maxInitialRequests: 25,
      minSize: 20000,
    },
  }

  // Select appropriate SplitChunksPlugin config for this build
  let splitChunksConfig: webpack.Options.SplitChunksOptions
  if (dev) {
    splitChunksConfig = splitChunksConfigs.dev
  } else {
    splitChunksConfig = splitChunksConfigs.prodGranular
  }

  const crossOrigin =
    !config.crossOrigin && config.experimental.modern
      ? 'anonymous'
      : config.crossOrigin

  let customAppFile: string | null = await findPageFile(
    pagesDir,
    '/_app',
    config.pageExtensions
  )
  if (customAppFile) {
    customAppFile = path.resolve(path.join(pagesDir, customAppFile))
  }

  const conformanceConfig = Object.assign(
    {
      ReactSyncScriptsConformanceCheck: {
        enabled: true,
      },
      MinificationConformanceCheck: {
        enabled: true,
      },
      DuplicatePolyfillsConformanceCheck: {
        enabled: true,
        BlockedAPIToBePolyfilled: Object.assign(
          [],
          ['fetch'],
          config.conformance?.DuplicatePolyfillsConformanceCheck
            ?.BlockedAPIToBePolyfilled || []
        ),
      },
      GranularChunksConformanceCheck: {
        enabled: true,
      },
    },
    config.conformance
  )

  function handleExternals(context: any, request: any, callback: any) {
    if (request === 'next') {
      return callback(undefined, `commonjs ${request}`)
    }

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

    // We need to externalize internal requests for files intended to
    // not be bundled.

    const isLocal: boolean =
      request.startsWith('.') ||
      // Always check for unix-style path, as webpack sometimes
      // normalizes as posix.
      path.posix.isAbsolute(request) ||
      // When on Windows, we also want to check for Windows-specific
      // absolute paths.
      (process.platform === 'win32' && path.win32.isAbsolute(request))
    const isLikelyNextExternal =
      isLocal && /[/\\]next-server[/\\]/.test(request)

    // Relative requires don't need custom resolution, because they
    // are relative to requests we've already resolved here.
    // Absolute requires (require('/foo')) are extremely uncommon, but
    // also have no need for customization as they're already resolved.
    if (isLocal && !isLikelyNextExternal) {
      return callback()
    }

    // Resolve the import with the webpack provided context, this
    // ensures we're resolving the correct version when multiple
    // exist.
    let res: string
    try {
      res = resolveRequest(request, `${context}/`)
    } catch (err) {
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

    let isNextExternal: boolean = false
    if (isLocal) {
      // we need to process next-server/lib/router/router so that
      // the DefinePlugin can inject process.env values
      isNextExternal = /next[/\\]dist[/\\]next-server[/\\](?!lib[/\\]router[/\\]router)/.test(
        res
      )

      if (!isNextExternal) {
        return callback()
      }
    }

    // `isNextExternal` special cases Next.js' internal requires that
    // should not be bundled. We need to skip the base resolve routine
    // to prevent it from being bundled (assumes Next.js version cannot
    // mismatch).
    if (!isNextExternal) {
      // Bundled Node.js code is relocated without its node_modules tree.
      // This means we need to make sure its request resolves to the same
      // package that'll be available at runtime. If it's not identical,
      // we need to bundle the code (even if it _should_ be external).
      let baseRes: string | null
      try {
        baseRes = resolveRequest(request, `${dir}/`)
      } catch (err) {
        baseRes = null
      }

      // Same as above: if the package, when required from the root,
      // would be different from what the real resolution would use, we
      // cannot externalize it.
      if (baseRes !== res) {
        return callback()
      }
    }

    // Default pages have to be transpiled
    if (
      !res.match(/next[/\\]dist[/\\]next-server[/\\]/) &&
      (res.match(/[/\\]next[/\\]dist[/\\]/) ||
        // This is the @babel/plugin-transform-runtime "helpers: true" option
        res.match(/node_modules[/\\]@babel[/\\]runtime[/\\]/))
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
    if (isNextExternal || res.match(/node_modules[/\\].*\.js$/)) {
      const externalRequest = isNextExternal
        ? // Generate Next.js external import
          path.posix.join(
            'next',
            'dist',
            path
              .relative(
                // Root of Next.js package:
                path.join(__dirname, '..'),
                res
              )
              // Windows path normalization
              .replace(/\\/g, '/')
          )
        : request

      return callback(undefined, `commonjs ${externalRequest}`)
    }

    // Default behavior: bundle the code!
    callback()
  }

  let webpackConfig: webpack.Configuration = {
    externals: !isServer
      ? // make sure importing "next" is handled gracefully for client
        // bundles in case a user imported types and it wasn't removed
        // TODO: should we warn/error for this instead?
        ['next']
      : !isServerless
      ? [
          isWebpack5
            ? ({ context, request }, callback) =>
                handleExternals(context, request, callback)
            : (context, request, callback) =>
                handleExternals(context, request, callback),
        ]
      : [
          // When the 'serverless' target is used all node_modules will be compiled into the output bundles
          // So that the 'serverless' bundles have 0 runtime dependencies
          '@ampproject/toolbox-optimizer', // except this one
        ],
    optimization: {
      // Webpack 5 uses a new property for the same functionality
      ...(isWebpack5 ? { emitOnErrors: !dev } : { noEmitOnErrors: dev }),
      checkWasmTypes: false,
      nodeEnv: false,
      splitChunks: isServer ? false : splitChunksConfig,
      runtimeChunk: isServer
        ? isWebpack5 && !isLikeServerless
          ? { name: 'webpack-runtime' }
          : undefined
        : { name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK },
      minimize: !(dev || isServer),
      minimizer: [
        // Minify JavaScript
        new TerserPlugin({
          extractComments: false,
          cache: path.join(distDir, 'cache', 'next-minifier'),
          parallel: config.experimental.cpus || true,
          terserOptions,
        }),
        // Minify CSS
        new CssMinimizerPlugin({
          postcssOptions: {
            map: {
              // `inline: false` generates the source map in a separate file.
              // Otherwise, the CSS file is needlessly large.
              inline: false,
              // `annotation: false` skips appending the `sourceMappingURL`
              // to the end of the CSS file. Webpack already handles this.
              annotation: false,
            },
          },
        }),
      ],
    },
    context: dir,
    node: {
      setImmediate: false,
    },
    // Kept as function to be backwards compatible
    entry: async () => {
      return {
        ...(clientEntries ? clientEntries : {}),
        ...entrypoints,
        ...(isServer
          ? {
              'init-server.js': 'next-plugin-loader?middleware=on-init-server!',
              'on-error-server.js':
                'next-plugin-loader?middleware=on-error-server!',
            }
          : {}),
      }
    },
    watchOptions: {
      ignored: ['**/.git/**', '**/node_modules/**', '**/.next/**'],
    },
    output: {
      ...(isWebpack5 ? { ecmaVersion: 5 } : {}),
      path: outputPath,
      // On the server we don't use the chunkhash
      filename: isServer
        ? '[name].js'
        : `static/chunks/[name]${dev ? '' : '-[chunkhash]'}.js`,
      library: isServer ? undefined : '_N_E',
      libraryTarget: isServer ? 'commonjs2' : 'assign',
      hotUpdateChunkFilename: isWebpack5
        ? 'static/webpack/[id].[fullhash].hot-update.js'
        : 'static/webpack/[id].[hash].hot-update.js',
      hotUpdateMainFilename: isWebpack5
        ? 'static/webpack/[fullhash].hot-update.json'
        : 'static/webpack/[hash].hot-update.json',
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
        'error-loader',
        'next-babel-loader',
        'next-client-pages-loader',
        'next-data-loader',
        'next-serverless-loader',
        'noop-loader',
        'next-plugin-loader',
      ].reduce((alias, loader) => {
        // using multiple aliases to replace `resolveLoader.modules`
        alias[loader] = path.join(__dirname, 'webpack', 'loaders', loader)

        return alias
      }, {} as Record<string, string>),
      modules: [
        'node_modules',
        ...nodePathList, // Support for NODE_PATH environment variable
      ],
      plugins: isWebpack5 ? [] : [require('pnp-webpack-plugin')],
    },
    module: {
      rules: [
        {
          test: /\.(tsx|ts|js|mjs|jsx)$/,
          include: [dir, ...babelIncludeRegexes],
          exclude: (excludePath: string) => {
            if (babelIncludeRegexes.some((r) => r.test(excludePath))) {
              return false
            }
            return /node_modules/.test(excludePath)
          },
          use: config.experimental.babelMultiThread
            ? [
                // Move Babel transpilation into a thread pool (2 workers, unlimited batch size).
                // Applying a cache to the off-thread work avoids paying transfer costs for unchanged modules.
                {
                  loader: 'next/dist/compiled/cache-loader',
                  options: {
                    cacheContext: dir,
                    cacheDirectory: path.join(dir, '.next', 'cache', 'webpack'),
                    cacheIdentifier: `webpack${isServer ? '-server' : ''}${
                      config.experimental.modern ? '-hasmodern' : ''
                    }`,
                  },
                },
                {
                  loader: require.resolve('next/dist/compiled/thread-loader'),
                  options: {
                    workers: 2,
                    workerParallelJobs: Infinity,
                  },
                },
                hasReactRefresh
                  ? require.resolve('@next/react-refresh-utils/loader')
                  : '',
                defaultLoaders.babel,
              ].filter(Boolean)
            : hasReactRefresh
            ? [
                require.resolve('@next/react-refresh-utils/loader'),
                defaultLoaders.babel,
              ]
            : defaultLoaders.babel,
        },
      ].filter(Boolean),
    },
    plugins: [
      hasReactRefresh && new ReactRefreshWebpackPlugin(),
      // Makes sure `Buffer` is polyfilled in client-side bundles (same behavior as webpack 4)
      isWebpack5 &&
        !isServer &&
        new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
      // Makes sure `process` is polyfilled in client-side bundles (same behavior as webpack 4)
      isWebpack5 &&
        !isServer &&
        new webpack.ProvidePlugin({ process: ['process'] }),
      // This plugin makes sure `output.filename` is used for entry chunks
      !isWebpack5 && new ChunkNamesPlugin(),
      new webpack.DefinePlugin({
        ...Object.keys(process.env).reduce(
          (prev: { [key: string]: string }, key: string) => {
            if (key.startsWith('NEXT_PUBLIC_')) {
              prev[`process.env.${key}`] = JSON.stringify(process.env[key]!)
            }
            return prev
          },
          {}
        ),
        ...Object.keys(config.env).reduce((acc, key) => {
          if (/^(?:NODE_.+)|^(?:__.+)$/i.test(key)) {
            throw new Error(
              `The key "${key}" under "env" in next.config.js is not allowed. https://err.sh/vercel/next.js/env-key-not-allowed`
            )
          }

          return {
            ...acc,
            [`process.env.${key}`]: JSON.stringify(config.env[key]),
          }
        }, {}),
        'process.env.NODE_ENV': JSON.stringify(webpackMode),
        'process.env.__NEXT_CROSS_ORIGIN': JSON.stringify(crossOrigin),
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
        'process.env.__NEXT_TRAILING_SLASH': JSON.stringify(
          config.trailingSlash
        ),
        'process.env.__NEXT_MODERN_BUILD': JSON.stringify(
          config.experimental.modern && !dev
        ),
        'process.env.__NEXT_BUILD_INDICATOR': JSON.stringify(
          config.devIndicators.buildActivity
        ),
        'process.env.__NEXT_PRERENDER_INDICATOR': JSON.stringify(
          config.devIndicators.autoPrerender
        ),
        'process.env.__NEXT_PLUGINS': JSON.stringify(
          config.experimental.plugins
        ),
        'process.env.__NEXT_STRICT_MODE': JSON.stringify(
          config.reactStrictMode
        ),
        'process.env.__NEXT_REACT_MODE': JSON.stringify(
          config.experimental.reactMode
        ),
        'process.env.__NEXT_OPTIMIZE_FONTS': JSON.stringify(
          config.experimental.optimizeFonts
        ),
        'process.env.__NEXT_SCROLL_RESTORATION': JSON.stringify(
          config.experimental.scrollRestoration
        ),
        'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(config.basePath),
        ...(isServer
          ? {
              // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
              // This is typically found in unmaintained modules from the
              // pre-webpack era (common in server-side code)
              'global.GENTLY': JSON.stringify(false),
            }
          : undefined),
        // stub process.env with proxy to warn a missing value is
        // being accessed in development mode
        ...(config.experimental.pageEnv && process.env.NODE_ENV !== 'production'
          ? {
              'process.env': `
            new Proxy(${isServer ? 'process.env' : '{}'}, {
              get(target, prop) {
                if (typeof target[prop] === 'undefined') {
                  console.warn(\`An environment variable (\${prop}) that was not provided in the environment was accessed.\nSee more info here: https://err.sh/next.js/missing-env-value\`)
                }
                return target[prop]
              }
            })
          `,
            }
          : {}),
      }),
      !isServer &&
        new ReactLoadablePlugin({
          filename: REACT_LOADABLE_MANIFEST,
        }),
      !isServer && new DropClientPage(),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      config.future.excludeDefaultMomentLocales &&
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/locale$/,
          contextRegExp: /moment$/,
        }),
      ...(dev
        ? (() => {
            // Even though require.cache is server only we have to clear assets from both compilations
            // This is because the client compilation generates the build manifest that's used on the server side
            const {
              NextJsRequireCacheHotReloader,
            } = require('./webpack/plugins/nextjs-require-cache-hot-reloader')
            const devPlugins = [new NextJsRequireCacheHotReloader()]

            if (!isServer) {
              devPlugins.push(new webpack.HotModuleReplacementPlugin())
            }

            return devPlugins
          })()
        : []),
      // Webpack 5 no longer requires this plugin in production:
      !isWebpack5 && !dev && new webpack.HashedModuleIdsPlugin(),
      !dev &&
        new webpack.IgnorePlugin({
          resourceRegExp: /react-is/,
          contextRegExp: /(next-server|next)[\\/]dist[\\/]/,
        }),
      isServerless && isServer && new ServerlessPlugin(),
      isServer && new PagesManifestPlugin(isLikeServerless),
      !isWebpack5 &&
        target === 'server' &&
        isServer &&
        new NextJsSSRModuleCachePlugin({ outputPath }),
      isServer && new NextJsSsrImportPlugin(),
      !isServer &&
        new BuildManifestPlugin({
          buildId,
          modern: config.experimental.modern,
        }),
      tracer &&
        new ProfilingPlugin({
          tracer,
        }),
      !isWebpack5 &&
        config.experimental.modern &&
        !isServer &&
        !dev &&
        (() => {
          const { NextEsmPlugin } = require('./webpack/plugins/next-esm-plugin')
          return new NextEsmPlugin({
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
          })
        })(),
      config.experimental.optimizeFonts &&
        !dev &&
        isServer &&
        (function () {
          const {
            FontStylesheetGatheringPlugin,
          } = require('./webpack/plugins/font-stylesheet-gathering-plugin')
          return new FontStylesheetGatheringPlugin()
        })(),
      config.experimental.conformance &&
        !isWebpack5 &&
        !dev &&
        new WebpackConformancePlugin({
          tests: [
            !isServer &&
              conformanceConfig.MinificationConformanceCheck.enabled &&
              new MinificationConformanceCheck(),
            conformanceConfig.ReactSyncScriptsConformanceCheck.enabled &&
              new ReactSyncScriptsConformanceCheck({
                AllowedSources:
                  conformanceConfig.ReactSyncScriptsConformanceCheck
                    .allowedSources || [],
              }),
            !isServer &&
              conformanceConfig.DuplicatePolyfillsConformanceCheck.enabled &&
              new DuplicatePolyfillsConformanceCheck({
                BlockedAPIToBePolyfilled:
                  conformanceConfig.DuplicatePolyfillsConformanceCheck
                    .BlockedAPIToBePolyfilled,
              }),
            !isServer &&
              conformanceConfig.GranularChunksConformanceCheck.enabled &&
              new GranularChunksConformanceCheck(
                splitChunksConfigs.prodGranular
              ),
          ].filter(Boolean),
        }),
      new WellKnownErrorsPlugin(),
    ].filter((Boolean as any) as ExcludesFalse),
  }

  // Support tsconfig and jsconfig baseUrl
  if (resolvedBaseUrl) {
    webpackConfig.resolve?.modules?.push(resolvedBaseUrl)
  }

  if (jsConfig?.compilerOptions?.paths && resolvedBaseUrl) {
    webpackConfig.resolve?.plugins?.unshift(
      new JsConfigPathsPlugin(jsConfig.compilerOptions.paths, resolvedBaseUrl)
    )
  }

  if (isWebpack5) {
    // On by default:
    delete webpackConfig.output?.futureEmitAssets
    // No longer polyfills Node.js modules:
    if (webpackConfig.node) delete webpackConfig.node.setImmediate

    if (dev) {
      if (!webpackConfig.optimization) {
        webpackConfig.optimization = {}
      }
      webpackConfig.optimization.usedExports = false
    }
  }

  webpackConfig = await buildConfiguration(webpackConfig, {
    rootDirectory: dir,
    customAppFile,
    isDevelopment: dev,
    isServer,
    assetPrefix: config.assetPrefix || '',
    sassOptions: config.sassOptions,
    productionBrowserSourceMaps,
  })

  let originalDevtool = webpackConfig.devtool
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

    if (dev && originalDevtool !== webpackConfig.devtool) {
      webpackConfig.devtool = originalDevtool
      devtoolRevertWarning(originalDevtool)
    }

    if (typeof (webpackConfig as any).then === 'function') {
      console.warn(
        '> Promise returned in next config. https://err.sh/vercel/next.js/promise-in-next-config'
      )
    }
  }

  // Backwards compat with webpack-dev-middleware options object
  if (typeof config.webpackDevMiddleware === 'function') {
    const options = config.webpackDevMiddleware({
      watchOptions: webpackConfig.watchOptions,
    })
    if (options.watchOptions) {
      webpackConfig.watchOptions = options.watchOptions
    }
  }

  function canMatchCss(rule: webpack.RuleSetCondition | undefined): boolean {
    if (!rule) {
      return false
    }

    const fileNames = [
      '/tmp/test.css',
      '/tmp/test.scss',
      '/tmp/test.sass',
      '/tmp/test.less',
      '/tmp/test.styl',
    ]

    if (rule instanceof RegExp && fileNames.some((input) => rule.test(input))) {
      return true
    }

    if (typeof rule === 'function') {
      if (
        fileNames.some((input) => {
          try {
            if (rule(input)) {
              return true
            }
          } catch (_) {}
          return false
        })
      ) {
        return true
      }
    }

    if (Array.isArray(rule) && rule.some(canMatchCss)) {
      return true
    }

    return false
  }

  const hasUserCssConfig =
    webpackConfig.module?.rules.some(
      (rule) => canMatchCss(rule.test) || canMatchCss(rule.include)
    ) ?? false

  if (hasUserCssConfig) {
    // only show warning for one build
    if (isServer) {
      console.warn(
        chalk.yellow.bold('Warning: ') +
          chalk.bold(
            'Built-in CSS support is being disabled due to custom CSS configuration being detected.\n'
          ) +
          'See here for more info: https://err.sh/next.js/built-in-css-disabled\n'
      )
    }

    if (webpackConfig.module?.rules.length) {
      // Remove default CSS Loader
      webpackConfig.module.rules = webpackConfig.module.rules.filter(
        (r) =>
          !(
            typeof r.oneOf?.[0]?.options === 'object' &&
            r.oneOf[0].options.__next_css_remove === true
          )
      )
    }
    if (webpackConfig.plugins?.length) {
      // Disable CSS Extraction Plugin
      webpackConfig.plugins = webpackConfig.plugins.filter(
        (p) => (p as any).__next_css_remove !== true
      )
    }
    if (webpackConfig.optimization?.minimizer?.length) {
      // Disable CSS Minifier
      webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.filter(
        (e) => (e as any).__next_css_remove !== true
      )
    }
  } else {
    await __overrideCssConfiguration(dir, !dev, webpackConfig)
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

  // Patch `@zeit/next-sass`, `@zeit/next-less`, `@zeit/next-stylus` for compatibility
  if (webpackConfig.module && Array.isArray(webpackConfig.module.rules)) {
    ;[].forEach.call(webpackConfig.module.rules, function (
      rule: webpack.RuleSetRule
    ) {
      if (!(rule.test instanceof RegExp && Array.isArray(rule.use))) {
        return
      }

      const isSass =
        rule.test.source === '\\.scss$' || rule.test.source === '\\.sass$'
      const isLess = rule.test.source === '\\.less$'
      const isCss = rule.test.source === '\\.css$'
      const isStylus = rule.test.source === '\\.styl$'

      // Check if the rule we're iterating over applies to Sass, Less, or CSS
      if (!(isSass || isLess || isCss || isStylus)) {
        return
      }

      ;[].forEach.call(rule.use, function (use: webpack.RuleSetUseItem) {
        if (
          !(
            use &&
            typeof use === 'object' &&
            // Identify use statements only pertaining to `css-loader`
            (use.loader === 'css-loader' ||
              use.loader === 'css-loader/locals') &&
            use.options &&
            typeof use.options === 'object' &&
            // The `minimize` property is a good heuristic that we need to
            // perform this hack. The `minimize` property was only valid on
            // old `css-loader` versions. Custom setups (that aren't next-sass,
            // next-less or next-stylus) likely have the newer version.
            // We still handle this gracefully below.
            (Object.prototype.hasOwnProperty.call(use.options, 'minimize') ||
              Object.prototype.hasOwnProperty.call(
                use.options,
                'exportOnlyLocals'
              ))
          )
        ) {
          return
        }

        // Try to monkey patch within a try-catch. We shouldn't fail the build
        // if we cannot pull this off.
        // The user may not even be using the `next-sass` or `next-less` or
        // `next-stylus` plugins.
        // If it does work, great!
        try {
          // Resolve the version of `@zeit/next-css` as depended on by the Sass,
          // Less or Stylus plugin.
          const correctNextCss = resolveRequest(
            '@zeit/next-css',
            isCss
              ? // Resolve `@zeit/next-css` from the base directory
                `${dir}/`
              : // Else, resolve it from the specific plugins
                require.resolve(
                  isSass
                    ? '@zeit/next-sass'
                    : isLess
                    ? '@zeit/next-less'
                    : isStylus
                    ? '@zeit/next-stylus'
                    : 'next'
                )
          )

          // If we found `@zeit/next-css` ...
          if (correctNextCss) {
            // ... resolve the version of `css-loader` shipped with that
            // package instead of whichever was hoisted highest in your
            // `node_modules` tree.
            const correctCssLoader = resolveRequest(use.loader, correctNextCss)
            if (correctCssLoader) {
              // We saved the user from a failed build!
              use.loader = correctCssLoader
            }
          }
        } catch (_) {
          // The error is not required to be handled.
        }
      })
    })
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
        const originalFile = clientEntries[
          CLIENT_STATIC_FILES_RUNTIME_MAIN
        ] as string
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
    // entry is always a function
    webpackConfig.entry = await (webpackConfig.entry as webpack.EntryFunc)()
  }

  return webpackConfig
}
