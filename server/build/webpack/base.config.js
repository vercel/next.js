import path, {sep} from 'path'
import webpack from 'webpack'
import nodeExternals from 'webpack-node-externals'
import UglifyJSPlugin from 'uglifyjs-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import {getPages} from './utils'
import CombineAssetsPlugin from '../plugins/combine-assets-plugin'
import PagesPlugin from '../plugins/pages-plugin'
import DynamicChunksPlugin from '../plugins/dynamic-chunks-plugin'
import StatsPlugin from 'stats-webpack-plugin'

const nextDir = path.join(__dirname, '..', '..', '..', '..')
const nextNodeModulesDir = path.join(nextDir, 'node_modules')

export default async function baseConfig (dir, {dev = false, isServer = false, buildId, config}) {
  const extractCSS = new ExtractTextPlugin('stylesheets/style.css')

  const cssLoader = {
    loader: isServer ? 'css-loader/locals' : 'css-loader',
    options: {
      modules: true,
      minimize: !dev,
      sourceMap: dev
    }
  }

  const externals = isServer ? [nodeExternals(nextNodeModulesDir), nodeExternals(path.join(dir, 'node_modules'))] : []
  let webpackConfig = {
    name: isServer ? 'server' : 'client',
    cache: true,
    profile: true,
    target: isServer ? 'node' : 'web',
    externals,
    context: dir,
    entry: async () => {
      // We use on-demand-entries in development
      const pages = dev ? {} : await getPages(dir, {dev, isServer})
      const mainJS = require.resolve(`../../../client/next${dev ? '-dev' : ''}`)
      const clientConfig = !isServer ? {
        'main.js': [
          mainJS
        ]
      } : {}
      return {
        ...clientConfig,
        ...pages
      }
    },
    output: {
      path: path.join(dir, '.next', isServer ? 'dist' : ''),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: `/_next/${buildId}/webpack/`
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      modules: [
        nextNodeModulesDir,
        'node_modules'
      ],
      alias: {
        'next': nextDir,
        'react-dom': dev ? 'react-dom/cjs/react-dom.development.js' : 'react-dom/cjs/react-dom.production.min.js'
      }
    },
    resolveLoader: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        path.join(__dirname, '..', 'loaders')
      ]
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          include: [dir],
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [require.resolve('../babel/preset')]
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            isServer && cssLoader,
            ...(!isServer ? extractCSS.extract([cssLoader]) : [])
          ].filter(Boolean)
        }
      ].filter(Boolean)
    },
    plugins: [
      // Useful when profiling
      // new webpack.ProgressPlugin({
      //   profile: true
      // }),
      // new StatsPlugin(`stats-${isServer ? 'server':'client'}.json`),
      new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
      dev && new FriendlyErrorsWebpackPlugin(),
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
      !isServer && new UglifyJSPlugin({
        exclude: /react\.js/,
        parallel: true,
        sourceMap: false,
        uglifyOptions: {
          compress: {
            comparisons: false
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
      !isServer && extractCSS,
      !isServer && new PagesPlugin(),
      !isServer && new DynamicChunksPlugin(),
      !isServer && new webpack.optimize.CommonsChunkPlugin({
        name: `commons`,
        filename: `commons.js`,
        minChunks: 2
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
      })

    ].filter(Boolean)
  }

  // if(isServer && typeof config.webpack === 'function') {
  //   webpackConfig = config.webpack(webpackConfig, {dev, buildId})
  // }

  return webpackConfig
}
