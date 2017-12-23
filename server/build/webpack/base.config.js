import path, {sep} from 'path'
import webpack from 'webpack'
import nodeExternals from 'webpack-node-externals'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import {getPages} from './utils'
import CombineAssetsPlugin from '../plugins/combine-assets-plugin'
import PagesPlugin from '../plugins/pages-plugin'

const nextDir = path.join(__dirname, '..', '..', '..', '..')
const nextNodeModulesDir = path.join(nextDir, 'node_modules')

export default async function baseConfig(dir, {dev = false, isServer = false, buildId, config}) {
  const extractCSS = new ExtractTextPlugin('stylesheets/style.css');

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
    target: isServer ? 'node' : 'web',
    externals,
    context: dir,
    entry: async () => {
      const pages = await getPages(dir, {dev, isServer})
      const mainJS = require.resolve(`../../../client/next${dev ? '-dev' : ''}`)
      return {
        'main.js': [
          mainJS
        ],
        ...pages
      }
    },
    output: {
      path: path.join(dir, '.next'),
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
          test: /\.json$/,
          loader: 'json-loader'
        },
        {
          test: /\.js$/,
          include: [dir],
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                [require.resolve('babel-preset-env'), {
                  modules: false
                }],
                require.resolve('babel-preset-react')
              ],
              plugins: [
                require.resolve('babel-plugin-react-require'),
                require.resolve('babel-plugin-transform-object-rest-spread'),
                require.resolve('babel-plugin-transform-class-properties'),
              ]
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
      ]
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
      }),
      new CombineAssetsPlugin({
        input: ['manifest.js', 'react.js', 'commons.js', 'main.js'],
        output: 'app.js'
      }),
      !dev && new webpack.optimize.ModuleConcatenationPlugin(),
      !isServer && extractCSS,
      !isServer && new PagesPlugin(),      
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
    ].filter(Boolean)
  }

  if(isServer && typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {dev, buildId})
  }

  return webpackConfig
}