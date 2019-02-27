import path from 'path'
import webpack from 'webpack'
import resolve from 'resolve'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import NextJsSSRModuleCachePlugin from './webpack/plugins/nextjs-ssr-module-cache'
import NextJsRequireCacheHotReloader from './webpack/plugins/nextjs-require-cache-hot-reloader'
import UnlinkFilePlugin from './webpack/plugins/unlink-file-plugin'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import ChunkNamesPlugin from './webpack/plugins/chunk-names-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { SERVER_DIRECTORY, REACT_LOADABLE_MANIFEST, CLIENT_STATIC_FILES_RUNTIME_WEBPACK, CLIENT_STATIC_FILES_RUNTIME_MAIN } from 'next-server/constants'
import { NEXT_PROJECT_ROOT, NEXT_PROJECT_ROOT_NODE_MODULES, NEXT_PROJECT_ROOT_DIST_CLIENT, PAGES_DIR_ALIAS, DOT_NEXT_ALIAS } from '../lib/constants'
import AutoDllPlugin from 'autodll-webpack-plugin'
import TerserPlugin from './webpack/plugins/terser-webpack-plugin/src/cjs.js'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import { WebpackEntrypoints } from './entries'
type ExcludesFalse = <T>(x: T | false) => x is T

export default function getBaseWebpackConfig (dir: string, {dev = false, isServer = false, buildId, config, target = 'server', entrypoints}: {dev?: boolean, isServer?: boolean, buildId: string, config: any, target?: string, entrypoints: WebpackEntrypoints}): webpack.Configuration {
  const defaultLoaders = {
    babel: {
      loader: 'next-babel-loader',
      options: { dev, isServer, cwd: dir }
    },
    // Backwards compat
    hotSelfAccept: {
      loader: 'noop-loader'
    }
  }

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const distDir = path.join(dir, config.distDir)
  const outputDir = target === 'serverless' ? 'serverless' : SERVER_DIRECTORY
  const outputPath = path.join(distDir, isServer ? outputDir : '')
  const totalPages = Object.keys(entrypoints).length
  const clientEntries = !isServer ? {
    // Backwards compatibility
    'main.js': [],
    [CLIENT_STATIC_FILES_RUNTIME_MAIN]: [
      path.join(NEXT_PROJECT_ROOT_DIST_CLIENT, (dev ? `next-dev` : 'next'))
    ].filter(Boolean)
  } : undefined

  const resolveConfig = {
    // Disable .mjs for node_modules bundling
    extensions: isServer ? ['.wasm', '.js', '.mjs', '.jsx', '.json'] : ['.wasm', '.mjs', '.js', '.jsx', '.json'],
    modules: [
      'node_modules',
      ...nodePathList // Support for NODE_PATH environment variable
    ],
    alias: {
      next: NEXT_PROJECT_ROOT,
      [PAGES_DIR_ALIAS]: path.join(dir, 'pages'),
      [DOT_NEXT_ALIAS]: distDir
    },
    mainFields: isServer ? ['main', 'module'] : ['browser', 'module', 'main']
  }

  const webpackMode = dev ? 'development' : 'production'

  const terserPluginConfig = {
    parallel: true,
    sourceMap: false,
    cache: true,
    cacheKeys: (keys: any) => {
      // path changes per build because we add buildId
      // because the input is already hashed the path is not needed
      delete keys.path
      return keys
    }
  }

  let webpackConfig: webpack.Configuration = {
    mode: webpackMode,
    devtool: dev ? 'cheap-module-source-map' : false,
    name: isServer ? 'server' : 'client',
    target: isServer ? 'node' : 'web',
    externals: isServer && target !== 'serverless' ? [
      (context, request, callback) => {
        const notExternalModules = [
          'next/app', 'next/document', 'next/link', 'next/router', 'next/error',
          'string-hash', 'hoist-non-react-statics', 'htmlescape','next/dynamic',
          'next/constants', 'next/config', 'next/head'
        ]

        if (notExternalModules.indexOf(request) !== -1) {
          return callback()
        }
    
        resolve(request, { basedir: context, preserveSymlinks: true }, (err, res) => {
          if (err) {
            return callback()
          }
    
          if (!res) {
            return callback()
          }
    
          // Default pages have to be transpiled
          if (res.match(/next[/\\]dist[/\\]/) || res.match(/node_modules[/\\]@babel[/\\]runtime[/\\]/) || res.match(/node_modules[/\\]@babel[/\\]runtime-corejs2[/\\]/)) {
            return callback()
          }
    
          // Webpack itself has to be compiled because it doesn't always use module relative paths
          if (res.match(/node_modules[/\\]webpack/) || res.match(/node_modules[/\\]css-loader/)) {
            return callback()
          }
    
          // styled-jsx has to be transpiled
          if (res.match(/node_modules[/\\]styled-jsx/)) {
            return callback()
          }
    
          if (res.match(/node_modules[/\\].*\.js$/)) {
            return callback(undefined, `commonjs ${request}`)
          }
    
          callback()
        })
      }
    ] : [
      // When the serverless target is used all node_modules will be compiled into the output bundles
      // So that the serverless bundles have 0 runtime dependencies
    ],
    optimization: isServer ? {
      splitChunks: false,
      minimizer: target === 'serverless' ? [
        new TerserPlugin({...terserPluginConfig,
          terserOptions: {
            compress: false,
            mangle: false,
            module: false,
            keep_classnames: true,
            keep_fnames: true
          }
        })
      ] : undefined
    } : {
      runtimeChunk: {
        name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK
      },
      splitChunks: dev ? {
        cacheGroups: {
          default: false,
          vendors: false
        }
      } : {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          commons: {
            name: 'commons',
            chunks: 'all',
            minChunks: totalPages > 2 ? totalPages * 0.5 : 2
          },
          react: {
            name: 'commons',
            chunks: 'all',
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/
          }
        }
      },
      minimizer: !dev ? [
        new TerserPlugin({...terserPluginConfig,
          terserOptions: {
            safari10: true
          }
        })
      ] : undefined,
    },
    recordsPath: path.join(outputPath, 'records.json'),
    context: dir,
    // Kept as function to be backwards compatible
    entry: async () => {
      return {
        ...clientEntries ? clientEntries : {},
        ...entrypoints
      }
    },
    output: {
      path: outputPath,
      filename: ({chunk}: {chunk: {name: string}}) => {
        // Use `[name]-[contenthash].js` in production
        if (!dev && (chunk.name === CLIENT_STATIC_FILES_RUNTIME_MAIN || chunk.name === CLIENT_STATIC_FILES_RUNTIME_WEBPACK)) {
          return chunk.name.replace(/\.js$/, '-[contenthash].js')
        }
        return '[name]'
      },
      libraryTarget: isServer ? 'commonjs2' : 'jsonp',
      hotUpdateChunkFilename: 'static/webpack/[id].[hash].hot-update.js',
      hotUpdateMainFilename: 'static/webpack/[hash].hot-update.json',
      // This saves chunks with the name given via `import()`
      chunkFilename: isServer ? `${dev ? '[name]' : '[name].[contenthash]'}.js` : `static/chunks/${dev ? '[name]' : '[name].[contenthash]'}.js`,
      strictModuleExceptionHandling: true,
      crossOriginLoading: config.crossOrigin,
      futureEmitAssets: !dev,
      webassemblyModuleFilename: 'static/wasm/[modulehash].wasm'
    },
    performance: { hints: false },
    resolve: resolveConfig,
    resolveLoader: {
      modules: [
        NEXT_PROJECT_ROOT_NODE_MODULES,
        'node_modules',
        path.join(__dirname, 'webpack', 'loaders'), // The loaders Next.js provides
        ...nodePathList // Support for NODE_PATH environment variable
      ]
    },
    module: {
      rules: [
        {
          test: /\.(js|mjs|jsx)$/,
          include: [dir, /next-server[\\/]dist[\\/]lib/],
          exclude: (path: string) => {
            if (/next-server[\\/]dist[\\/]lib/.test(path)) {
              return false
            }

            return /node_modules/.test(path)
          },
          use: defaultLoaders.babel
        }
      ].filter(Boolean)
    },
    plugins: [
      target === 'serverless' && isServer && new ServerlessPlugin(),
      // Precompile react / react-dom for development, speeding up webpack
      dev && !isServer && new AutoDllPlugin({
        filename: '[name]_[hash].js',
        path: './static/development/dll',
        context: dir,
        entry: {
          dll: [
            'react',
            'react-dom'
          ]
        },
        config: {
          mode: webpackMode,
          resolve: resolveConfig
        }
      }),
      // This plugin makes sure `output.filename` is used for entry chunks
      new ChunkNamesPlugin(),
      !isServer && new ReactLoadablePlugin({
        filename: REACT_LOADABLE_MANIFEST
      }),
      // Even though require.cache is server only we have to clear assets from both compilations
      // This is because the client compilation generates the build manifest that's used on the server side
      dev && new NextJsRequireCacheHotReloader(),
      dev && !isServer && new webpack.HotModuleReplacementPlugin(),
      dev && new webpack.NoEmitOnErrorsPlugin(),
      dev && new UnlinkFilePlugin(),
      dev && new CaseSensitivePathPlugin(), // Since on macOS the filesystem is case-insensitive this will make sure your path are case-sensitive
      !dev && new webpack.HashedModuleIdsPlugin(),
      // Removes server/client code by minifier
      new webpack.DefinePlugin({
        ...(Object.keys(config.env).reduce((acc, key) => {
          if (/^(?:NODE_.+)|(?:__.+)$/i.test(key)) {
            throw new Error(`The key "${key}" under "env" in next.config.js is not allowed. https://err.sh/zeit/next.js/env-key-not-allowed`)
          }

          return {
            ...acc,
            [`process.env.${key}`]: JSON.stringify(config.env[key])
          }
        }, {})),
        'process.crossOrigin': JSON.stringify(config.crossOrigin),
        'process.browser': JSON.stringify(!isServer)
      }),
      // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
      !isServer && dev && new webpack.DefinePlugin({
        'process.env.__NEXT_DIST_DIR': JSON.stringify(distDir)
      }),
      target !== 'serverless' && isServer && new PagesManifestPlugin(),
      !isServer && new BuildManifestPlugin(),
      isServer && new NextJsSsrImportPlugin(),
      target !== 'serverless' && isServer && new NextJsSSRModuleCachePlugin({ outputPath }),
      !dev && new webpack.IgnorePlugin({
        checkResource: (resource: string) => {
          return /react-is/.test(resource)
        },
        checkContext: (context: string) => {
          return /next-server[\\/]dist[\\/]/.test(context) || /next[\\/]dist[\\/]/.test(context)
        }
      })
    ].filter(Boolean as any as ExcludesFalse)
  }

  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, { dir, dev, isServer, buildId, config, defaultLoaders, totalPages })
  }

  // Backwards compat for `main.js` entry key
  const originalEntry = webpackConfig.entry
  if (typeof originalEntry !== 'undefined') {
    webpackConfig.entry = async () => {
      const entry = typeof originalEntry === 'function' ? await originalEntry() : originalEntry
      if (entry && typeof entry !== 'string' && !Array.isArray(entry)) {
        // Server compilation doesn't have main.js
        if (typeof entry['main.js'] !== 'undefined') {
          entry[CLIENT_STATIC_FILES_RUNTIME_MAIN] = [
            ...entry['main.js'],
            ...entry[CLIENT_STATIC_FILES_RUNTIME_MAIN]
          ]

          delete entry['main.js']
        }
      }

      return entry
    }
  }

  return webpackConfig
}
