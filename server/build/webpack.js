import { resolve } from 'path'
import webpack from 'webpack'
import glob from 'glob-promise'

export default async function createCompiler(dir, { hotReload = false } = {}) {
  const pages = await glob('**/*.js', { cwd: resolve(dir, 'pages') })

  const entry = {}
  const defaultEntries = hotReload ? ['webpack/hot/only-dev-server'] : []
  for (const p of pages) {
    entry[p] = defaultEntries.concat(['./pages/' + p])
  }

  if (!entry['_error.js']) {
    entry._error = resolve(__dirname, '..', '..', 'pages', '_error.js')
  }

  const nodeModulesDir = resolve(__dirname, '..', '..', '..', 'node_modules')

  const plugins = hotReload
  ? [new webpack.HotModuleReplacementPlugin()]
  : [
    new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false },
      sourceMap: false
    })
  ]

  const babelRuntimePath = require.resolve('babel-runtime/package')
  .replace(/[\\\/]package\.json$/, '');

  const loaders = [{
    test: /\.js$/,
    loader: 'babel',
    include: [
      resolve(dir),
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
      path: resolve(dir, '.next', '_bundles', 'pages'),
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
        resolve(__dirname, '..', 'loaders')
      ]
    },
    plugins,
    module: {
      preLoaders: [
        { test: /\.json$/, loader: 'json-loader' }
      ],
      loaders
    }
  })
}
