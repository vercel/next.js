import { resolve, join, sep } from 'path'
import webpack from 'webpack'
import glob from 'glob-promise'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import PagesPlugin from './plugins/pages-plugin'
import CombineAssetsPlugin from './plugins/combine-assets-plugin'
import getConfig from '../config'
import findBabelConfig from './babel/find-config'

const defaultPages = [
  '_error.js'
]
const nextPagesDir = join(__dirname, '../../../browser/pages')
const nextNodeModulesDir = join(__dirname, '../../../node_modules')

export default async function createCompiler (dir, { buildId = '-', dev = false, quiet = false, buildDir, conf = null } = {}) {
  dir = resolve(dir)
  const config = getConfig(dir, conf)
  const defaultEntries = dev ? [
    require.resolve('../../../browser/client/webpack-hot-middleware-client')
  ] : []
  const mainJS = dev
    ? require.resolve('../../../browser/client/next-dev') : require.resolve('../../../browser/client/next')

  let totalPages

  const entry = async () => {
    const entries = {
      'main.js': [
        ...defaultEntries,
        ...config.clientBootstrap || [],
        mainJS
      ]
    }

    const pages = await glob('pages/**/*.js', { cwd: dir })
    const devPages = pages.filter((p) => p === 'pages/_error.js')

    // In the dev environment, on-demand-entry-handler will take care of
    // managing pages.
    const entryPages = dev ? devPages : pages.filter((p) => p !== 'pages/_document.js' && !/\.test\.js/.test(p))
    for (const p of entryPages) {
      entries[p.replace(/^(pages\/.*)\/index.js$/, '$1.js')] = [`./${p}?entry`]
    }

    for (const p of defaultPages) {
      const entryName = join('pages', p)
      if (!entries[entryName]) {
        entries[entryName] = [join(nextPagesDir, p) + '?entry']
      }
    }

    totalPages = pages.length

    return entries
  }

  const plugins = [
    new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
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
        // We need to move react-dom explicitly into common chunks.
        // Otherwise, if some other page or module uses it, it might
        // included in that bundle too.
        if (module.context && module.context.indexOf(`${sep}react-dom${sep}`) >= 0) {
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
    // This chunk contains all the webpack related code. So, all the changes
    // related to that happens to this chunk.
    // It won't touch commons.js and that gives us much better re-build perf.
    new webpack.optimize.CommonsChunkPlugin({
      name: 'manifest',
      filename: 'manifest.js'
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
    }),
    new PagesPlugin(),
    new CaseSensitivePathPlugin()
  ]

  if (dev) {
    plugins.push(
      new webpack.HotModuleReplacementPlugin(),
      new webpack.NoEmitOnErrorsPlugin(),
      new UnlinkFilePlugin()
    )
    if (!quiet) {
      plugins.push(new FriendlyErrorsWebpackPlugin())
    }
  } else {
    plugins.push(new webpack.NormalModuleReplacementPlugin(
      /react-hot-loader/,
      require.resolve('../../../browser/client/hot-module-loader.stub')
    ))
    plugins.push(
      new CombineAssetsPlugin({
        input: ['manifest.js', 'pages/_error.js', 'commons.js', 'main.js'],
        output: 'app.js'
      }),
      new webpack.optimize.UglifyJsPlugin({
        exclude: ['manifest.js', 'commons.js', 'main.js', 'pages/_error.js'],
        compress: { warnings: false },
        sourceMap: false,
        extractComments: true
      })
    )
    plugins.push(new webpack.optimize.ModuleConcatenationPlugin())
  }

  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const mainBabelOptions = {
    cacheDirectory: true,
    presets: []
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

  const rules = (dev ? [{
    test: /\.js(\?[^?]*)?$/,
    loader: 'hot-self-accept-loader',
    include: [
      join(dir, 'pages'),
      nextPagesDir
    ]
  }] : [])
    .concat([{
      test: /\.json$/,
      loader: 'json-loader'
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
      pathinfo: !!dev,
      path: buildDir ? join(buildDir, '.next', 'bundles') : join(dir, config.distDir, 'bundles'),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: `/_next/${buildId}/`,
      strictModuleExceptionHandling: true,
      // This saves chunks with the name given via require.ensure()
      chunkFilename: '[name]'
    },
    resolve: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        ...nodePathList
      ],
      alias: {
        'object-assign': 'core-js/fn/object/assign',
        'strip-ansi': require.resolve('../../../browser/client/strip-ansi.stub')
      }
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
    devtool: dev ? 'cheap-module-inline-source-map' : false,
    performance: { hints: false }
  }

  if (config.webpack) {
    console.log(`> Using "webpack" config function defined in ${config.configOrigin}.`)
    webpackConfig = await config.webpack(webpackConfig, { buildId, dev })
  }
  return webpack(webpackConfig)
}
