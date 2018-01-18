import path, {sep} from 'path'
import fs from 'fs'
import webpack from 'webpack'

import nodeExternals from 'webpack-node-externals'
import UglifyJSPlugin from 'uglifyjs-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import {getPages} from './webpack/utils'
import CombineAssetsPlugin from './plugins/combine-assets-plugin'
import PagesPlugin from './plugins/pages-plugin'
import DynamicChunksPlugin from './plugins/dynamic-chunks-plugin'
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

function babelConfig (dir, isServer) {
  const mainBabelOptions = {
    cacheDirectory: true,
    presets: [],
    plugins: [
      !isServer && require.resolve('react-hot-loader/babel')
    ].filter(Boolean)
  }

  const externalBabelConfig = findBabelConfig(dir)
  if (externalBabelConfig) {
    console.log(`> Using external babel configuration`)
    console.log(`> Location: "${externalBabelConfig.loc}"`)
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

  if (fs.existsSync(nextNodeModulesDir)) {
    externals.push(nodeExternals({
      modulesDir: nextNodeModulesDir,
      includeAbsolutePaths: true,
      whitelist: [/\.(?!(?:js|json)$).{1,5}$/i]
    }))
  }

  const dirNodeModules = path.join(dir, 'node_modules')
  if (fs.existsSync(dirNodeModules)) {
    nodeExternals({
      modulesDir: dirNodeModules,
      includeAbsolutePaths: true,
      whitelist: [/\.(?!(?:js|json)$).{1,5}$/i]
    })
  }

  return externals
}

export default async function getBaseWebpackConfig (dir, {dev = false, isServer = false, buildId, config}) {
  const extractCSS = new ExtractTextPlugin({
    filename: 'static/style.css',
    disable: dev
  })

  const cssLoader = {
    loader: isServer ? 'css-loader/locals' : 'css-loader',
    options: {
      modules: false,
      minimize: !dev,
      sourceMap: dev,
      importLoaders: 1,
      ...(config.cssLoader || {})
    }
  }

  const postcssLoader = {
    loader: 'postcss-loader',
    options: {
      plugins: () => {}
    }
  }

  function cssLoaderConfig (loader = false) {
    return [
      isServer && !cssLoader.options.modules && 'ignore-loader',
      isServer && cssLoader.options.modules && cssLoader,
      isServer && cssLoader.options.modules && postcssLoader,
      isServer && cssLoader.options.modules && loader,
      ...(!isServer ? extractCSS.extract({
        use: [cssLoader, postcssLoader, loader].filter(Boolean),
        // Use style-loader in development
        fallback: {
          loader: 'style-loader',
          options: {
            sourceMap: true,
            importLoaders: 1
          }
        }
      }) : [])
    ].filter(Boolean)
  }

  const babelLoaderOptions = babelConfig(dir, isServer)

  const defaultLoaders = {
    babel: {
      loader: 'babel-loader',
      options: babelLoaderOptions
    },
    css: cssLoaderConfig(),
    scss: cssLoaderConfig('sass-loader'),
    less: cssLoaderConfig('less-loader')
  }

  let totalPages

  let webpackConfig = {
    devtool: dev ? 'cheap-module-source-map' : false,
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
      publicPath: `/_next/webpack/`,
      // This saves chunks with the name given via require.ensure()
      chunkFilename: '[name]-[chunkhash].js',
      sourceMapFilename: '[file].map?[contenthash]'
    },
    performance: { hints: false },
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
        },
        {
          test: /\.css$/,
          use: defaultLoaders.css
        },
        {
          test: /\.scss$/,
          use: defaultLoaders.scss
        },
        {
          test: /\.less$/,
          use: defaultLoaders.less
        }
      ].filter(Boolean)
    },
    plugins: [
      new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
      dev && new webpack.NoEmitOnErrorsPlugin(),
      dev && !isServer && new FriendlyErrorsWebpackPlugin(),
      dev && new webpack.NamedModulesPlugin(),
      dev && new webpack.HotModuleReplacementPlugin(), // Hot module replacement
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
