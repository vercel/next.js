import { resolve, join } from 'path'
import webpack from 'webpack'
import WriteFilePlugin from 'write-file-webpack-plugin'
import glob from 'glob-promise'
import getConfig from '../config'

const nextNodeModulesDir = join(__dirname, '../../../node_modules')

export default async function createCompiler (dir, { buildId = '-', dev = false, quiet = false, conf = null } = {}) {
  const addedEntries = {}

  dir = resolve(dir)
  const config = getConfig(dir, conf)
  const defaultEntries = dev ? [
    require.resolve('../../../browser/client/webpack-hot-middleware-client')
  ] : []
  const mainJS = dev
    ? require.resolve('../../../browser/client/next-dev') : require.resolve('../../../browser/client/next')

  const entry = async () => {
    const loader = ''
    const base = [
      ...defaultEntries,
      ...config.clientBootstrap || [],
      `${loader}./pages/_error.js`,
      mainJS
    ]

    // In the dev environment, on-demand-entry-handler will take care of
    // managing pages.
    const entryPages = dev
      ? Object.values(addedEntries)
      : (await glob('./pages/**/*.js', { cwd: dir }))
        .filter((p) => !p.includes('pages/_') && !/\.test\.js/.test(p) && !/__tests__/.test(p))

    function buildEntry (modules) {
      if (config.polyfill) {
        return `polyfill-loader?${JSON.stringify({ modules: modules, test: config.polyfill.test, buildId })}!`
      } else {
        return modules
      }
    }

    const entries = {
      'pages/_error.js': buildEntry(base)
    }
    for (const p of entryPages) {
      entries[p.replace(/^.*?\/pages\//, 'pages/').replace(/^(pages\/.*)\/index.js$/, '$1')] = buildEntry(base.concat(`${loader}${p}`))
    }
    if (config.polyfill) {
      entries['polyfill.js'] = config.polyfill.entry
    }

    return entries
  }

  const plugins = [
    new WriteFilePlugin({
      exitOnErrors: false,
      log: false,
      // required not to cache removed files
      useHashIndex: false
    })
  ]

  if (dev) {
    plugins.push(
      new webpack.HotModuleReplacementPlugin()
    )
  } else {
    plugins.push(new webpack.NormalModuleReplacementPlugin(
      /react-hot-loader/,
      require.resolve('../../../browser/client/hot-module-loader.stub')
    ))
  }

  const mainBabelOptions = {
    cacheDirectory: true
  }

  const rules = (dev ? [{
    test: /\.js(\?[^?]*)?$/,
    loader: 'hot-self-accept-loader',
    include: [
      join(dir, 'pages')
    ]
  }] : [])
    .concat([{
      test: /\.js(\?[^?]*)?$/,
      loader: 'babel-loader',
      include: [dir],
      exclude (str) {
        return /node_modules/.test(str)
      },
      options: mainBabelOptions
    }, {
      test: /\.js(\?[^?]*)?$/,
      loader: 'page-loader',
      include: [join(dir, 'pages')]
    }])

  let webpackConfig = {
    name: 'client',
    mode: dev ? 'development' : 'production',
    target: 'web',
    context: dir,
    entry,
    output: {
      pathinfo: !!dev,
      path: join(dir, '.next', 'bundles'),
      publicPath: `/_next/`,
      strictModuleExceptionHandling: true,
      filename: `${buildId}/[name]`,
      chunkFilename: !dev ? '[name]-[chunkhash:5].js' : '[name].js'
    },
    resolve: {
      modules: [
        nextNodeModulesDir,
        'node_modules'
      ],
      alias: {
        'next/page-loader': require.resolve('../../../browser/lib/page-loader'),
        'html-entities': require.resolve('../../../browser/lib/html-entities'),
        'strip-ansi': require.resolve('../../../browser/client/strip-ansi.stub')
      }
    },
    resolveLoader: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        join(__dirname, 'loaders')
      ]
    },
    plugins,
    module: {
      rules
    },
    devtool: dev ? 'inline-source-map' : 'source-map',

    optimization: {
      namedModules: !!dev,
      minimize: !dev,
      splitChunks: { // CommonsChunkPlugin()
        name: true,
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]|[\\/]next\.js[\\/]/,
            name: 'vendor',
            chunks: 'initial',
            minChunks: dev ? 1 : 2,
            priority: 100
          }
        }
      },
      noEmitOnErrors: true,
      concatenateModules: !dev
    },
    performance: { hints: false }
  }

  if (config.webpack) {
    console.log(`> Using "webpack" config function defined in ${config.configOrigin}.`)
    webpackConfig = await config.webpack(webpackConfig, { buildId, dev })
  }

  const compiler = webpack(webpackConfig)
  compiler.setEntry = (name, path) => {
    addedEntries[name] = path
  }
  return compiler
}
