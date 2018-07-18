// @flow
import type {NextConfig} from '../server/config'
import path from 'path'
import webpack from 'webpack'
import resolve from 'resolve'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import WebpackBar from 'webpackbar'
import {getPages} from './webpack/utils'
import PagesPlugin from './webpack/plugins/pages-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import UnlinkFilePlugin from './webpack/plugins/unlink-file-plugin'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import ChunkNamesPlugin from './webpack/plugins/chunk-names-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import {SERVER_DIRECTORY, NEXT_PROJECT_ROOT, NEXT_PROJECT_ROOT_NODE_MODULES, NEXT_PROJECT_ROOT_DIST, DEFAULT_PAGES_DIR, REACT_LOADABLE_MANIFEST} from '../lib/constants'

function externalsConfig (dir, isServer) {
  const externals = []

  if (!isServer) {
    return externals
  }

  externals.push((context, request, callback) => {
    resolve(request, { basedir: dir, preserveSymlinks: true }, (err, res) => {
      if (err) {
        return callback()
      }

      // Default pages have to be transpiled
      if (res.match(/node_modules[/\\]next[/\\]dist[/\\]pages/)) {
        return callback()
      }

      // Webpack itself has to be compiled because it doesn't always use module relative paths
      if (res.match(/node_modules[/\\]webpack/)) {
        return callback()
      }

      if (res.match(/node_modules[/\\].*\.js$/)) {
        return callback(null, `commonjs ${request}`)
      }

      callback()
    })
  })

  return externals
}

function optimizationConfig ({dir, dev, isServer, totalPages}) {
  if (isServer) {
    return {
      splitChunks: false,
      minimizer: []
    }
  }

  const config: any = {
    runtimeChunk: {
      name: 'static/commons/manifest.js'
    },
    splitChunks: {
      cacheGroups: {
        default: false,
        vendors: false
      }
    }
  }

  if (dev) {
    return config
  }

  return config
}

type BaseConfigContext = {|
  dev: boolean,
  isServer: boolean,
  buildId: string,
  config: NextConfig
|}

export default async function getBaseWebpackConfig (dir: string, {dev = false, isServer = false, buildId, config}: BaseConfigContext) {
  const defaultLoaders = {
    babel: {
      loader: 'next-babel-loader',
      options: {dev, isServer}
    },
    hotSelfAccept: {
      loader: 'hot-self-accept-loader',
      options: {
        include: [
          path.join(dir, 'pages')
        ],
        // All pages are javascript files. So we apply hot-self-accept-loader here to facilitate hot reloading of pages.
        // This makes sure plugins just have to implement `pageExtensions` instead of also implementing the loader
        extensions: new RegExp(`\\.+(${config.pageExtensions.join('|')})$`)
      }
    }
  }

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const pagesEntries = await getPages(dir, {nextPagesDir: DEFAULT_PAGES_DIR, dev, isServer, pageExtensions: config.pageExtensions.join('|')})
  const totalPages = Object.keys(pagesEntries).length
  const clientEntries = !isServer ? {
    // Backwards compatibility
    'main.js': [],
    'static/commons/main.js': [
      path.join(NEXT_PROJECT_ROOT_DIST, 'client', (dev ? `next-dev` : 'next'))
    ].filter(Boolean)
  } : {}

  let webpackConfig = {
    mode: dev ? 'development' : 'production',
    devtool: dev ? 'cheap-module-source-map' : false,
    name: isServer ? 'server' : 'client',
    cache: true,
    target: isServer ? 'node' : 'web',
    externals: externalsConfig(dir, isServer),
    optimization: optimizationConfig({dir, dev, isServer, totalPages}),
    context: dir,
    // Kept as function to be backwards compatible
    entry: async () => {
      return {
        ...clientEntries,
        // Only _error and _document when in development. The rest is handled by on-demand-entries
        ...pagesEntries
      }
    },
    output: {
      path: path.join(dir, config.distDir, isServer ? SERVER_DIRECTORY : ''),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      // This saves chunks with the name given via `import()`
      chunkFilename: isServer ? '[name].js' : 'chunks/[name].js',
      strictModuleExceptionHandling: true
    },
    performance: { hints: false },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      modules: [
        NEXT_PROJECT_ROOT_NODE_MODULES,
        'node_modules',
        ...nodePathList // Support for NODE_PATH environment variable
      ],
      alias: {
        next: NEXT_PROJECT_ROOT
      }
    },
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
        dev && !isServer && {
          test: defaultLoaders.hotSelfAccept.options.extensions,
          include: defaultLoaders.hotSelfAccept.options.include,
          use: defaultLoaders.hotSelfAccept
        },
        {
          test: /\.(js|jsx)$/,
          include: [dir],
          exclude: /node_modules/,
          use: defaultLoaders.babel
        }
      ].filter(Boolean)
    },
    plugins: [
      new ChunkNamesPlugin(),
      !isServer && new ReactLoadablePlugin({
        filename: REACT_LOADABLE_MANIFEST
      }),
      new WebpackBar({
        name: isServer ? 'server' : 'client'
      }),
      dev && !isServer && new FriendlyErrorsWebpackPlugin(),
      new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
      dev && !isServer && new webpack.HotModuleReplacementPlugin(),
      dev && new webpack.NoEmitOnErrorsPlugin(),
      dev && new UnlinkFilePlugin(),
      dev && new CaseSensitivePathPlugin(), // Since on macOS the filesystem is case-insensitive this will make sure your path are case-sensitive
      dev && new WriteFilePlugin({
        exitOnErrors: false,
        log: false,
        // required not to cache removed files
        useHashIndex: false
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
      }),
      !dev && new webpack.optimize.ModuleConcatenationPlugin(),
      isServer && new PagesManifestPlugin(),
      !isServer && new BuildManifestPlugin(),
      !isServer && new PagesPlugin(),
      isServer && new NextJsSsrImportPlugin()
      // In dev mode, we don't move anything to the commons bundle.
      // In production we move common modules into the existing main.js bundle
      // !isServer && new webpack.optimize.CommonsChunkPlugin({
      //   name: 'main.js',
      //   filename: dev ? 'static/commons/main.js' : 'static/commons/main-[chunkhash].js',
      //   minChunks (module, count) {
      //     // React and React DOM are used everywhere in Next.js. So they should always be common. Even in development mode, to speed up compilation.
      //     if (module.resource && module.resource.includes(`${sep}react-dom${sep}`) && count >= 0) {
      //       return true
      //     }

      //     if (module.resource && module.resource.includes(`${sep}react${sep}`) && count >= 0) {
      //       return true
      //     }

      //     // In the dev we use on-demand-entries.
      //     // So, it makes no sense to use commonChunks based on the minChunks count.
      //     // Instead, we move all the code in node_modules into each of the pages.
      //     if (dev) {
      //       return false
      //     }

      //     // Check if the module is used in the _app.js bundle
      //     // Because _app.js is used on every page we don't want to
      //     // duplicate them in other bundles.
      //     const chunks = module.getChunks()
      // const appBundlePath = path.normalize('bundles/pages/_app.js')
      // const inAppBundle = chunks.some(chunk => chunk.entryModule
      //   ? chunk.entryModule.name === appBundlePath
      //   : null
      // )

      //     if (inAppBundle && chunks.length > 1) {
      //       return true
      //     }

      //     // If there are one or two pages, only move modules to common if they are
      //     // used in all of the pages. Otherwise, move modules used in at-least
      //     // 1/2 of the total pages into commons.
      //     if (totalPages <= 2) {
      //       return count >= totalPages
      //     }
      //     return count >= totalPages * 0.5
      //   }
      // }),
      // // We use a manifest file in development to speed up HMR
      // dev && !isServer && new webpack.optimize.CommonsChunkPlugin({
      //   name: 'manifest.js',
      //   filename: dev ? 'static/commons/manifest.js' : 'static/commons/manifest-[chunkhash].js'
      // })
    ].filter(Boolean)
  }

  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {dir, dev, isServer, buildId, config, defaultLoaders, totalPages})
  }

  // Backwards compat for `main.js` entry key
  const originalEntry = webpackConfig.entry
  webpackConfig.entry = async () => {
    const entry: any = {...await originalEntry()}

    // Server compilation doesn't have main.js
    if (typeof entry['main.js'] !== 'undefined') {
      entry['static/commons/main.js'] = [
        ...entry['main.js'],
        ...entry['static/commons/main.js']
      ]

      delete entry['main.js']
    }

    return entry
  }

  return webpackConfig
}
