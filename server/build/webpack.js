import { resolve, join } from 'path'
import { createHash } from 'crypto'
import webpack from 'webpack'
import glob from 'glob-promise'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import WatchPagesPlugin from './plugins/watch-pages-plugin'
import JsonPagesPlugin from './plugins/json-pages-plugin'
import getConfig from '../config'
import * as babelCore from 'babel-core'
import findBabelConfig from './babel/find-config'

const documentPage = join('pages', '_document.js')
const defaultPages = [
  '_error.js',
  '_document.js'
]
const nextPagesDir = join(__dirname, '..', '..', 'pages')
const nextNodeModulesDir = join(__dirname, '..', '..', '..', 'node_modules')
const interpolateNames = new Map(defaultPages.map((p) => {
  return [join(nextPagesDir, p), `dist/pages/${p}`]
}))

export default async function createCompiler (dir, buildFolder, { dev = false, quiet = false } = {}) {
  dir = resolve(dir)
  const config = getConfig(dir)
  const defaultEntries = dev
    ? [join(__dirname, '..', '..', 'client/webpack-hot-middleware-client')] : []
  const mainJS = dev
    ? require.resolve('../../client/next-dev') : require.resolve('../../client/next')

  let minChunks

  const entry = async () => {
    const entries = { 'main.js': mainJS }

    const pages = await glob('pages/**/*.js', { cwd: dir })
    for (const p of pages) {
      entries[join('bundles', p)] = [...defaultEntries, `./${p}?entry`]
    }

    for (const p of defaultPages) {
      const entryName = join('bundles', 'pages', p)
      if (!entries[entryName]) {
        entries[entryName] = [...defaultEntries, join(nextPagesDir, p) + '?entry']
      }
    }

    // calculate minChunks of CommonsChunkPlugin for later use
    minChunks = Math.max(2, pages.filter((p) => p !== documentPage).length)

    return entries
  }

  const plugins = [
    new webpack.LoaderOptionsPlugin({
      options: {
        context: dir,
        customInterpolateName (url, name, opts) {
          return interpolateNames.get(this.resourcePath) || url
        }
      }
    }),
    new WriteFilePlugin({
      exitOnErrors: false,
      log: false,
      // required not to cache removed files
      useHashIndex: false
    }),
    new webpack.optimize.CommonsChunkPlugin({
      name: 'commons',
      filename: 'commons.js',
      minChunks (module, count) {
        // NOTE: it depends on the fact that the entry funtion is always called
        // before applying CommonsChunkPlugin
        return count >= minChunks
      }
    }),
    new JsonPagesPlugin(),
    new CaseSensitivePathPlugin()
  ]

  if (dev) {
    plugins.push(
      new webpack.HotModuleReplacementPlugin(),
      new webpack.NoEmitOnErrorsPlugin(),
      new UnlinkFilePlugin(),
      new WatchPagesPlugin(dir)
    )
    if (!quiet) {
      plugins.push(new FriendlyErrorsWebpackPlugin())
    }
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

  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const mainBabelOptions = {
    cacheDirectory: true,
    sourceMaps: dev ? 'both' : false,
    presets: []
  }

  const externalBabelConfig = findBabelConfig(dir)
  if (externalBabelConfig) {
    console.log(`> Using external babel configuration`)
    console.log(`> location: "${externalBabelConfig.loc}"`)
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

  const rules = (dev ? [{
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
    options: {
      name: 'dist/[path][name].[ext]',
      // By default, our babel config does not transpile ES2015 module syntax because
      // webpack knows how to handle them. (That's how it can do tree-shaking)
      // But Node.js doesn't know how to handle them. So, we have to transpile them here.
      transform ({ content, sourceMap, interpolatedName }) {
        // Only handle .js files
        if (!(/\.js$/.test(interpolatedName))) {
          return { content, sourceMap }
        }
        const babelRuntimePath = require.resolve('babel-runtime/package')
          .replace(/[\\/]package\.json$/, '')
        const transpiled = babelCore.transform(content, {
          babelrc: false,
          sourceMaps: dev ? 'both' : false,
          // Here we need to resolve all modules to the absolute paths.
          // Earlier we did it with the babel-preset.
          // But since we don't transpile ES2015 in the preset this is not resolving.
          // That's why we need to do it here.
          // See more: https://github.com/zeit/next.js/issues/951
          plugins: [
            [require.resolve('babel-plugin-transform-es2015-modules-commonjs')],
            [
              require.resolve('babel-plugin-module-resolver'),
              {
                alias: {
                  'babel-runtime': babelRuntimePath,
                  'next/link': require.resolve('../../lib/link'),
                  'next/prefetch': require.resolve('../../lib/prefetch'),
                  'next/css': require.resolve('../../lib/css'),
                  'next/head': require.resolve('../../lib/head'),
                  'next/document': require.resolve('../../server/document'),
                  'next/router': require.resolve('../../lib/router'),
                  'next/error': require.resolve('../../lib/error'),
                  'styled-jsx/style': require.resolve('styled-jsx/style')
                }
              }
            ]
          ],
          inputSourceMap: sourceMap
        })

        return {
          content: transpiled.code,
          sourceMap: transpiled.map
        }
      }
    }
  }, {
    loader: 'babel-loader',
    include: nextPagesDir,
    exclude (str) {
      return /node_modules/.test(str) && str.indexOf(nextPagesDir) !== 0
    },
    options: {
      babelrc: false,
      cacheDirectory: true,
      sourceMaps: dev ? 'both' : false,
      presets: [require.resolve('./babel/preset')]
    }
  }, {
    test: /\.js(\?[^?]*)?$/,
    loader: 'babel-loader',
    include: [dir],
    exclude (str) {
      return /node_modules/.test(str)
    },
    options: mainBabelOptions
  }])

  let webpackConfig = {
    context: dir,
    entry,
    output: {
      path: join(dir, buildFolder || '.next'),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: '/_webpack/',
      strictModuleExceptionHandling: true,
      devtoolModuleFilenameTemplate ({ resourcePath }) {
        const hash = createHash('sha1')
        hash.update(Date.now() + '')
        const id = hash.digest('hex').slice(0, 7)

        // append hash id for cache busting
        return `webpack:///${resourcePath}?${id}`
      }
    },
    resolve: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        ...nodePathList
      ]
    },
    resolveLoader: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        join(__dirname, 'loaders'),
        ...nodePathList
      ]
    },
    plugins,
    module: {
      rules
    },
    devtool: dev ? 'inline-source-map' : false,
    performance: { hints: false }
  }

  if (config.webpack) {
    console.log('> Using "webpack" config function defined in next.config.js.')
    webpackConfig = await config.webpack(webpackConfig, { dev })
  }
  return webpack(webpackConfig)
}
