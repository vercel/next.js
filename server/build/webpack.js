import path, {sep} from 'path'
import webpack from 'webpack'
import resolve from 'resolve'
import UglifyJSPlugin from 'uglifyjs-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import {getPages} from './webpack/utils'
import CombineAssetsPlugin from './plugins/combine-assets-plugin'
import PagesPlugin from './plugins/pages-plugin'
import NextJsSsrImportPlugin from './plugins/nextjs-ssr-import'
import DynamicChunksPlugin from './plugins/dynamic-chunks-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import findBabelConfig from './babel/find-config'

const nextDir = path.join(__dirname, '..', '..', '..')
const nextNodeModulesDir = path.join(nextDir, 'node_modules')
const nextPagesDir = path.join(nextDir, 'pages')
const defaultPages = [
  '_error.js',
  '_document.js'
]
const interpolateNames = new Map(defaultPages.map((p) => {
  return [path.join(nextPagesDir, p), `dist/bundles/pages/${p}`]
}))

function babelConfig (dir, {isServer, dev}) {
  const mainBabelOptions = {
    cacheDirectory: true,
    presets: [],
    plugins: [
      dev && !isServer && require.resolve('react-hot-loader/babel')
    ].filter(Boolean)
  }

  const externalBabelConfig = findBabelConfig(dir)
  if (externalBabelConfig) {
    // Log it out once
    if (!isServer) {
      console.log(`> Using external babel configuration`)
      console.log(`> Location: "${externalBabelConfig.loc}"`)
    }
    // It's possible to turn off babelrc support via babelrc itself.
    // In that case, we should add our default preset.
    // That's why we need to do this.
    const { options } = externalBabelConfig
    mainBabelOptions.babelrc = options.babelrc !== false
  } else {
    mainBabelOptions.babelrc = false
  }

  // Add our default preset if the no "babelrc" found.
  if (!mainBabelOptions.babelrc) {
    mainBabelOptions.presets.push(require.resolve('./babel/preset'))
  }

  return mainBabelOptions
}

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

      if (res.match(/node_modules/) && !res.match(/.(css|sass|scss|less|svg)/)) {
        return callback(null, `commonjs ${request}`)
      }

      callback()
    })
  })

  return externals
}

export default async function getBaseWebpackConfig (dir, {dev = false, isServer = false, buildId, config}) {
  const babelLoaderOptions = babelConfig(dir, {dev, isServer})

  const defaultLoaders = {
    babel: {
      loader: 'babel-loader',
      options: babelLoaderOptions
    }
  }

  let totalPages

  let webpackConfig = {
    devtool: dev ? 'source-map' : false,
    name: isServer ? 'server' : 'client',
    cache: true,
    target: isServer ? 'node' : 'web',
    externals: externalsConfig(dir, isServer),
    context: dir,
    entry: async () => {
      const pages = await getPages(dir, {dev, isServer})
      totalPages = Object.keys(pages).length
      const mainJS = require.resolve(`../../client/next${dev ? '-dev' : ''}`)
      const clientConfig = !isServer ? {
        'main.js': [
          dev && !isServer && path.join(__dirname, '..', '..', 'client', 'webpack-hot-middleware-client'),
          dev && !isServer && path.join(__dirname, '..', '..', 'client', 'on-demand-entries-client'),
          mainJS
        ].filter(Boolean)
      } : {}
      return {
        ...clientConfig,
        ...pages
      }
    },
    output: {
      path: path.join(dir, config.distDir, isServer ? 'dist' : ''), // server compilation goes to `.next/dist`
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: `${config.assetPrefix}/_next/webpack/`,
      // This saves chunks with the name given via require.ensure()
      chunkFilename: '[name]-[chunkhash].js',
      strictModuleExceptionHandling: true,
      devtoolModuleFilenameTemplate: '[absolute-resource-path]'
    },
    performance: { hints: false },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      modules: [
        nextNodeModulesDir,
        'node_modules'
      ],
      alias: {
        next: nextDir,
        // This bypasses React's check for production mode. Since we know it is in production this way.
        // This allows us to exclude React from being uglified. Saving multiple seconds per build.
        react: dev ? 'react/cjs/react.development.js' : 'react/cjs/react.production.min.js',
        'react-dom': dev ? 'react-dom/cjs/react-dom.development.js' : 'react-dom/cjs/react-dom.production.min.js'
      }
    },
    resolveLoader: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        path.join(__dirname, 'loaders')
      ]
    },
    module: {
      rules: [
        dev && !isServer && {
          test: /\.(js|jsx)(\?[^?]*)?$/,
          loader: 'hot-self-accept-loader',
          include: [
            path.join(dir, 'pages'),
            nextPagesDir
          ]
        },
        {
          test: /\.+(js|jsx)$/,
          include: [dir],
          exclude: /node_modules/,
          use: defaultLoaders.babel
        }
      ].filter(Boolean)
    },
    plugins: [
      new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
      dev && new webpack.NoEmitOnErrorsPlugin(),
      dev && !isServer && new FriendlyErrorsWebpackPlugin(),
      dev && new webpack.NamedModulesPlugin(),
      dev && !isServer && new webpack.HotModuleReplacementPlugin(), // Hot module replacement
      dev && new UnlinkFilePlugin(),
      dev && new CaseSensitivePathPlugin(), // Since on macOS the filesystem is case-insensitive this will make sure your path are case-sensitive
      dev && new webpack.LoaderOptionsPlugin({
        options: {
          context: dir,
          customInterpolateName (url, name, opts) {
            return interpolateNames.get(this.resourcePath) || url
          }
        }
      }),
      dev && new WriteFilePlugin({
        exitOnErrors: false,
        log: false,
        // required not to cache removed files
        useHashIndex: false
      }),
      !dev && new webpack.IgnorePlugin(/react-hot-loader/),
      !isServer && !dev && new UglifyJSPlugin({
        exclude: /react\.js/,
        parallel: true,
        sourceMap: false,
        uglifyOptions: {
          compress: {
            arrows: false,
            booleans: false,
            collapse_vars: false,
            comparisons: false,
            computed_props: false,
            hoist_funs: false,
            hoist_props: false,
            hoist_vars: false,
            if_return: false,
            inline: false,
            join_vars: false,
            keep_infinity: true,
            loops: false,
            negate_iife: false,
            properties: false,
            reduce_funcs: false,
            reduce_vars: false,
            sequences: false,
            side_effects: false,
            switches: false,
            top_retain: false,
            toplevel: false,
            typeofs: false,
            unused: false,
            conditionals: false,
            dead_code: true,
            evaluate: false
          }
        }
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
      }),
      !isServer && new CombineAssetsPlugin({
        input: ['manifest.js', 'react.js', 'commons.js', 'main.js'],
        output: 'app.js'
      }),
      !dev && new webpack.optimize.ModuleConcatenationPlugin(),
      !isServer && new PagesPlugin(),
      !isServer && new DynamicChunksPlugin(),
      isServer && new NextJsSsrImportPlugin({ dir, dist: config.distDir }),
      !isServer && new webpack.optimize.CommonsChunkPlugin({
        name: `commons`,
        filename: `commons.js`,
        minChunks (module, count) {
          // We need to move react-dom explicitly into common chunks.
          // Otherwise, if some other page or module uses it, it might
          // included in that bundle too.
          if (dev && module.context && module.context.indexOf(`${sep}react${sep}`) >= 0) {
            return true
          }

          if (dev && module.context && module.context.indexOf(`${sep}react-dom${sep}`) >= 0) {
            return true
          }

          // In the dev we use on-demand-entries.
          // So, it makes no sense to use commonChunks based on the minChunks count.
          // Instead, we move all the code in node_modules into each of the pages.
          if (dev) {
            return false
          }

          // If there are one or two pages, only move modules to common if they are
          // used in all of the pages. Otherwise, move modules used in at-least
          // 1/2 of the total pages into commons.
          if (totalPages <= 2) {
            return count >= totalPages
          }
          return count >= totalPages * 0.5
        }
      }),
      !isServer && new webpack.optimize.CommonsChunkPlugin({
        name: 'react',
        filename: 'react.js',
        minChunks (module, count) {
          if (dev) {
            return false
          }

          if (module.resource && module.resource.includes(`${sep}react-dom${sep}`) && count >= 0) {
            return true
          }

          if (module.resource && module.resource.includes(`${sep}react${sep}`) && count >= 0) {
            return true
          }

          return false
        }
      }),
      !isServer && new webpack.optimize.CommonsChunkPlugin({
        name: 'manifest',
        filename: 'manifest.js'
      })
    ].filter(Boolean)
  }

  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {dir, dev, isServer, buildId, config, defaultLoaders})
  }

  return webpackConfig
}
