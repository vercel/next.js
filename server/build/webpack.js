import { resolve, join } from 'path'
import { createHash } from 'crypto'
import webpack from 'webpack'
import glob from 'glob-promise'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import WatchPagesPlugin from './plugins/watch-pages-plugin'
import WatchRemoveEventPlugin from './plugins/watch-remove-event-plugin'
import DynamicEntryPlugin from './plugins/dynamic-entry-plugin'
import DetachPlugin from './plugins/detach-plugin'
import getConfig from '../config'

export default async function createCompiler (dir, { dev = false } = {}) {
  dir = resolve(dir)

  const pages = await glob('pages/**/*.js', {
    cwd: dir,
    ignore: 'pages/_document.js'
  })

  const entry = {
    'main.js': dev ? require.resolve('../../client/next-dev') : require.resolve('../../client/next')
  }

  const defaultEntries = dev
    ? [join(__dirname, '..', '..', 'client/webpack-hot-middleware-client')] : []
  for (const p of pages) {
    entry[join('bundles', p)] = defaultEntries.concat([`./${p}?entry`])
  }

  const nextPagesDir = join(__dirname, '..', '..', 'pages')

  const errorEntry = join('bundles', 'pages', '_error.js')
  const defaultErrorPath = join(nextPagesDir, '_error.js')
  if (!entry[errorEntry]) {
    entry[errorEntry] = defaultEntries.concat([defaultErrorPath + '?entry'])
  }

  const errorDebugEntry = join('bundles', 'pages', '_error-debug.js')
  const errorDebugPath = join(nextPagesDir, '_error-debug.js')
  entry[errorDebugEntry] = errorDebugPath

  const nodeModulesDir = join(__dirname, '..', '..', '..', 'node_modules')

  const plugins = [
    new WriteFilePlugin({
      exitOnErrors: false,
      log: false,
      // required not to cache removed files
      useHashIndex: false
    }),
    new webpack.optimize.CommonsChunkPlugin({
      name: 'commons',
      filename: 'commons.js',
      minChunks: Math.max(2, pages.length)
    })
  ]

  if (dev) {
    plugins.push(
      new webpack.optimize.OccurrenceOrderPlugin(),
      new webpack.HotModuleReplacementPlugin(),
      new webpack.NoErrorsPlugin(),
      new DetachPlugin(),
      new DynamicEntryPlugin(),
      new UnlinkFilePlugin(),
      new WatchRemoveEventPlugin(),
      new WatchPagesPlugin(dir),
      new FriendlyErrorsWebpackPlugin()
    )
  } else {
    plugins.push(
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      new webpack.optimize.UglifyJsPlugin({
        compress: { warnings: false },
        sourceMap: false
      })
    )
  }

  const babelRuntimePath = require.resolve('babel-runtime/package')
  .replace(/[\\/]package\.json$/, '')

  const loaders = (dev ? [{
    test: /\.js(\?[^?]*)?$/,
    loader: 'hot-self-accept-loader',
    include: [
      join(dir, 'pages'),
      nextPagesDir
    ]
  }, {
    test: /\.js(\?[^?]*)?$/,
    loader: 'react-hot-loader/webpack',
    exclude: /node_modules/
  }] : [])
  .concat([{
    test: /\.json$/,
    loader: 'json-loader'
  }, {
    test: /\.(js|json)(\?[^?]*)?$/,
    loader: 'emit-file-loader',
    include: [dir, nextPagesDir],
    exclude (str) {
      return /node_modules/.test(str) && str.indexOf(nextPagesDir) !== 0
    },
    query: {
      name: 'dist/[path][name].[ext]'
    }
  }, {
    loader: 'babel',
    include: nextPagesDir,
    query: {
      babelrc: false,
      sourceMaps: dev ? 'both' : false,
      plugins: [
        [
          require.resolve('babel-plugin-module-resolver'),
          {
            alias: {
              'ansi-html': require.resolve('ansi-html')
            }
          }
        ]
      ]
    }
  }, {
    test: /\.js(\?[^?]*)?$/,
    loader: 'babel',
    include: [dir, nextPagesDir],
    exclude (str) {
      return /node_modules/.test(str) && str.indexOf(nextPagesDir) !== 0
    },
    query: {
      babelrc: false,
      sourceMaps: dev ? 'both' : false,
      presets: ['es2015', 'react'],
      plugins: [
        require.resolve('babel-plugin-react-require'),
        require.resolve('babel-plugin-transform-async-to-generator'),
        require.resolve('babel-plugin-transform-object-rest-spread'),
        require.resolve('babel-plugin-transform-class-properties'),
        require.resolve('babel-plugin-transform-runtime'),
        [
          require.resolve('babel-plugin-module-resolver'),
          {
            alias: {
              'babel-runtime': babelRuntimePath,
              react: require.resolve('react'),
              'react-dom': require.resolve('react-dom'),
              'next/link': require.resolve('../../lib/link'),
              'next/prefetch': require.resolve('../../lib/prefetch'),
              'next/css': require.resolve('../../lib/css'),
              'next/head': require.resolve('../../lib/head'),
              'next/document': require.resolve('../../server/document')
            }
          }
        ]
      ]
    }
  }])

  const interpolateNames = new Map([
    [defaultErrorPath, 'dist/pages/_error.js'],
    [errorDebugPath, 'dist/pages/_error-debug.js']
  ])

  let webpackConfig = {
    context: dir,
    entry,
    output: {
      path: join(dir, '.next'),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: dev ? '/_webpack/' : null,
      devtoolModuleFilenameTemplate ({ resourcePath }) {
        const hash = createHash('sha1')
        hash.update(Date.now() + '')
        const id = hash.digest('hex').slice(0, 7)

        // append hash id for cache busting
        return `webpack:///${resourcePath}?${id}`
      }
    },
    resolve: {
      root: [
        nodeModulesDir,
        join(dir, 'node_modules')
      ].concat(
        (process.env.NODE_PATH || '')
        .split(process.platform === 'win32' ? ';' : ':')
      )
    },
    resolveLoader: {
      root: [
        nodeModulesDir,
        join(__dirname, 'loaders')
      ]
    },
    plugins,
    module: {
      loaders
    },
    devtool: dev ? 'inline-source-map' : false,
    customInterpolateName: function (url, name, opts) {
      return interpolateNames.get(this.resourcePath) || url
    }
  }
  const config = getConfig(dir)
  if (config.webpack) {
    console.log('> Using Webpack config function defined in next.config.js.')
    webpackConfig = await config.webpack(webpackConfig, { dev })
  }
  return webpack(webpackConfig)
}
