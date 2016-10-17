import { resolve, join } from 'path'
import webpack from 'webpack'
import glob from 'glob-promise'
import WriteFilePlugin from 'write-file-webpack-plugin'

export default async function createCompiler (dir, { hotReload = false } = {}) {
  dir = resolve(dir)

  const pages = await glob('pages/**/*.js', { cwd: dir })

  const entry = {}
  const defaultEntries = hotReload ? ['webpack/hot/only-dev-server'] : []
  for (const p of pages) {
    entry[join('bundles', p)] = defaultEntries.concat(['./' + p])
  }

  const errorEntry = join('bundles', 'pages', '_error.js')
  const defaultErrorPath = resolve(__dirname, '..', '..', 'pages', '_error.js')
  if (!entry[errorEntry]) entry[errorEntry] = defaultErrorPath

  const nodeModulesDir = resolve(__dirname, '..', '..', '..', 'node_modules')

  const plugins = [
    hotReload
    ? new webpack.HotModuleReplacementPlugin()
    : new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false },
      sourceMap: false
    }),
    new WriteFilePlugin({ log: false })
  ]

  const babelRuntimePath = require.resolve('babel-runtime/package')
  .replace(/[\\\/]package\.json$/, '')

  const loaders = [{
    test: /\.js$/,
    loader: 'emit-file-loader',
    include: [
      dir,
      resolve(__dirname, '..', '..', 'pages')
    ],
    exclude: /node_modules/,
    query: {
      name: 'dist/[path][name].[ext]'
    }
  }, {
    test: /\.js$/,
    loader: 'babel',
    include: [
      dir,
      resolve(__dirname, '..', '..', 'pages')
    ],
    exclude: /node_modules/,
    query: {
      presets: ['es2015', 'react'],
      plugins: [
        'transform-async-to-generator',
        'transform-object-rest-spread',
        'transform-class-properties',
        'transform-runtime',
        [
          'module-alias',
          [
            { src: `npm:${babelRuntimePath}`, expose: 'babel-runtime' },
            { src: `npm:${require.resolve('react')}`, expose: 'react' },
            { src: `npm:${require.resolve('../../lib/link')}`, expose: 'next/link' },
            { src: `npm:${require.resolve('../../lib/css')}`, expose: 'next/css' },
            { src: `npm:${require.resolve('../../lib/head')}`, expose: 'next/head' }
          ]
        ]
      ]
    }
  }]
  .concat(hotReload ? [{
    test: /\.js$/,
    loader: 'hot-self-accept-loader',
    include: resolve(dir, 'pages')
  }] : [])

  return webpack({
    context: dir,
    entry,
    output: {
      path: resolve(dir, '.next'),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: hotReload ? 'http://localhost:3030/' : null
    },
    externals: [
      'react',
      'react-dom',
      {
        [require.resolve('react')]: 'react',
        [require.resolve('../../lib/link')]: 'next/link',
        [require.resolve('../../lib/css')]: 'next/css',
        [require.resolve('../../lib/head')]: 'next/head'
      }
    ],
    resolve: {
      root: [
        nodeModulesDir,
        resolve(dir, 'node_modules')
      ]
    },
    resolveLoader: {
      root: [
        nodeModulesDir,
        resolve(__dirname, 'loaders')
      ]
    },
    plugins,
    module: {
      preLoaders: [
        { test: /\.json$/, loader: 'json-loader' }
      ],
      loaders
    },
    customInterpolateName: function (url, name, opts) {
      if (defaultErrorPath === this.resourcePath) {
        return 'dist/pages/_error.js'
      }
      return url
    }
  })
}
