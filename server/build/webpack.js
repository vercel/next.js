import { resolve, join, sep } from 'path'
import { createHash } from 'crypto'
import { realpathSync, existsSync } from 'fs'
import webpack from 'webpack'
import glob from 'glob-promise'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import UglifyJSPlugin from 'uglifyjs-webpack-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import PagesPlugin from './plugins/pages-plugin'
import DynamicChunksPlugin from './plugins/dynamic-chunks-plugin'
import CombineAssetsPlugin from './plugins/combine-assets-plugin'
import getConfig from '../config'
import * as babelCore from 'babel-core'
import findBabelConfig from './babel/find-config'
import rootModuleRelativePath from './root-module-relative-path'

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

const relativeResolve = rootModuleRelativePath(require)

async function getPages ({dir, dev, pagesGlobPattern}) {
  let pages

  if (dev) {
    pages = await glob('pages/+(_document|_error).+(js|jsx)', { cwd: dir })
  } else {
    pages = await glob(pagesGlobPattern, { cwd: dir })
  }

  return pages
}

function getPageEntries (pages) {
  const entries = {}
  for (const p of pages) {
    entries[join('bundles', p.replace('.jsx', '.js'))] = [`./${p}?entry`]
  }

  // The default pages (_document.js and _error.js) are only added when they're not provided by the user
  for (const p of defaultPages) {
    const entryName = join('bundles', 'pages', p)
    if (!entries[entryName]) {
      entries[entryName] = [join(nextPagesDir, p) + '?entry']
    }
  }

  return entries
}

export default async function createCompiler (dir, { buildId, dev = false, quiet = false, buildDir, conf = null } = {}) {
  // Resolve relative path to absolute path
  dir = realpathSync(resolve(dir))

  // Used to track the amount of pages for webpack commons chunk plugin
  let totalPages

  // Loads next.config.js and custom configuration provided in custom server initialization
  const config = getConfig(dir, conf)

  // Middlewares to handle on-demand entries and hot updates in development
  const devEntries = dev ? [
    join(__dirname, '..', '..', 'client', 'webpack-hot-middleware-client'),
    join(__dirname, '..', '..', 'client', 'on-demand-entries-client')
  ] : []

  const mainJS = require.resolve(`../../client/next${dev ? '-dev' : ''}`) // Uses client/next-dev in development for code splitting dev dependencies

  const entry = async () => {
    // Get entries for pages in production mode. In development only _document and _error are added. Because pages are added by on-demand-entry-handler.
    const pages = await getPages({dir, dev, pagesGlobPattern: config.pagesGlobPattern})
    const pageEntries = getPageEntries(pages)

    // Used for commons chunk calculations
    totalPages = pages.length
    if (pages.indexOf(documentPage) !== -1) {
      totalPages = totalPages - 1
    }

    const entries = {
      'main.js': [
        ...devEntries, // Adds hot middleware and ondemand entries in development
        ...config.clientBootstrap || [], // clientBootstrap can be used to load polyfills before code execution
        mainJS // Main entrypoint in the client folder
      ],
      ...pageEntries
    }

    return entries
  }

  const plugins = [
    // Defines NODE_ENV as development/production. This is used by some npm modules to determine if they should optimize.
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production')
    }),
    new CaseSensitivePathPlugin(), // Since on macOS the filesystem is case-insensitive this will make sure your path are case-sensitive
    new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
    // Provide legacy options to webpack
    new webpack.LoaderOptionsPlugin({
      options: {
        context: dir,
        customInterpolateName (url, name, opts) {
          return interpolateNames.get(this.resourcePath) || url
        }
      }
    }),
    // Writes all generated files to disk, even in development. For SSR.
    new WriteFilePlugin({
      exitOnErrors: false,
      log: false,
      // required not to cache removed files
      useHashIndex: false
    }),
    // Moves common modules into commons.js
    new webpack.optimize.CommonsChunkPlugin({
      name: 'commons',
      filename: 'commons.js',
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
    // This chunk splits out react and react-dom in production to make sure it does not go through uglify. This saved multiple seconds on production builds.
    // See https://twitter.com/dan_abramov/status/944040306420408325
    new webpack.optimize.CommonsChunkPlugin({
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
    // This chunk contains all the webpack related code. So, all the changes
    // related to that happens to this chunk.
    // It won't touch commons.js and that gives us much better re-build perf.
    new webpack.optimize.CommonsChunkPlugin({
      name: 'manifest',
      filename: 'manifest.js'
    }),

    // This adds Next.js route definitions to page bundles
    new PagesPlugin(),
    // Implements support for dynamic imports
    new DynamicChunksPlugin()
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
    plugins.push(new webpack.IgnorePlugin(/react-hot-loader/))
    plugins.push(
      // Minifies javascript bundles
      new UglifyJSPlugin({
        exclude: /react\.js/,
        parallel: true,
        sourceMap: false,
        uglifyOptions: {
          compress: {
            comparisons: false
          }
        }
      })
    )
    plugins.push(
      // Combines manifest.js commons.js and main.js into app.js in production
      new CombineAssetsPlugin({
        input: ['manifest.js', 'react.js', 'commons.js', 'main.js'],
        output: 'app.js'
      }),
    )
    // Implements scope hoisting which speeds up browser execution of javascript
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

  const devLoaders = dev ? [{
    test: /\.(js|jsx)(\?[^?]*)?$/,
    loader: 'hot-self-accept-loader',
    include: [
      join(dir, 'pages'),
      nextPagesDir
    ]
  }, {
    test: /\.(js|jsx)(\?[^?]*)?$/,
    loader: 'react-hot-loader/webpack',
    exclude: /node_modules/
  }] : []

  const loaders = [{
    test: /\.json$/,
    loader: 'json-loader'
  }, {
    test: /\.(js|jsx|json)(\?[^?]*)?$/,
    loader: 'emit-file-loader',
    include: [dir, nextPagesDir],
    exclude (str) {
      return /node_modules/.test(str) && str.indexOf(nextPagesDir) !== 0
    },
    options: {
      name: 'dist/[path][name].[ext]',
      // We need to strip off .jsx on the server. Otherwise require without .jsx doesn't work.
      interpolateName: (name) => name.replace('.jsx', '.js'),
      validateFileName (file) {
        const cases = [{from: '.js', to: '.jsx'}, {from: '.jsx', to: '.js'}]

        for (const item of cases) {
          const {from, to} = item
          if (file.slice(-(from.length)) !== from) {
            continue
          }

          const filePath = file.slice(0, -(from.length)) + to

          if (existsSync(filePath)) {
            throw new Error(`Both ${from} and ${to} file found. Please make sure you only have one of both.`)
          }
        }
      },
      // By default, our babel config does not transpile ES2015 module syntax because
      // webpack knows how to handle them. (That's how it can do tree-shaking)
      // But Node.js doesn't know how to handle them. So, we have to transpile them here.
      transform ({ content, sourceMap, interpolatedName }) {
        // Only handle .js files
        if (!(/\.(js|jsx)$/.test(interpolatedName))) {
          return { content, sourceMap }
        }

        const transpiled = babelCore.transform(content, {
          babelrc: false,
          sourceMaps: dev ? 'both' : false,
          // Here we need to resolve all modules to the absolute paths.
          // Earlier we did it with the babel-preset.
          // But since we don't transpile ES2015 in the preset this is not resolving.
          // That's why we need to do it here.
          // See more: https://github.com/zeit/next.js/issues/951
          plugins: [
            require.resolve(join(__dirname, './babel/plugins/remove-dotjsx-from-import.js')),
            [require.resolve('babel-plugin-transform-es2015-modules-commonjs')],
            [
              require.resolve('babel-plugin-module-resolver'),
              {
                alias: {
                  'babel-runtime': relativeResolve('babel-runtime/package'),
                  'next/link': relativeResolve('../../lib/link'),
                  'next/prefetch': relativeResolve('../../lib/prefetch'),
                  'next/css': relativeResolve('../../lib/css'),
                  'next/dynamic': relativeResolve('../../lib/dynamic'),
                  'next/head': relativeResolve('../../lib/head'),
                  'next/document': relativeResolve('../../server/document'),
                  'next/router': relativeResolve('../../lib/router'),
                  'next/error': relativeResolve('../../lib/error'),
                  'styled-jsx/style': relativeResolve('styled-jsx/style')
                }
              }
            ]
          ],
          inputSourceMap: sourceMap
        })

        // Strip ?entry to map back to filesystem and work with iTerm, etc.
        let { map } = transpiled
        let output = transpiled.code

        if (map) {
          let nodeMap = Object.assign({}, map)
          nodeMap.sources = nodeMap.sources.map((source) => source.replace(/\?entry/, ''))
          delete nodeMap.sourcesContent

          // Output explicit inline source map that source-map-support can pickup via requireHook mode.
          // Since these are not formal chunks, the devtool infrastructure in webpack does not output
          // a source map for these files.
          const sourceMapUrl = new Buffer(JSON.stringify(nodeMap), 'utf-8').toString('base64')
          output = `${output}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${sourceMapUrl}`
        }

        return {
          content: output,
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
      presets: [require.resolve('./babel/preset')]
    }
  }, {
    test: /\.(js|jsx)(\?[^?]*)?$/,
    loader: 'babel-loader',
    include: [dir],
    exclude (str) {
      return /node_modules/.test(str)
    },
    options: mainBabelOptions
  }]

  let webpackConfig = {
    context: dir,
    entry,
    output: {
      path: buildDir ? join(buildDir, '.next') : join(dir, config.distDir),
      filename: '[name]',
      libraryTarget: 'commonjs2',
      publicPath: `/_next/webpack/`,
      strictModuleExceptionHandling: true,
      devtoolModuleFilenameTemplate ({ resourcePath }) {
        const hash = createHash('sha1')
        hash.update(Date.now() + '')
        const id = hash.digest('hex').slice(0, 7)

        // append hash id for cache busting
        return `webpack:///${resourcePath}?${id}`
      },
      // This saves chunks with the name given via require.ensure()
      chunkFilename: '[name]-[chunkhash].js'
    },
    resolve: {
      alias: {
        // This bypasses React's check for production mode. Since we know it is in production this way.
        // This allows us to exclude React from being uglified. Saving multiple seconds per build.
        'react-dom': dev ? 'react-dom/cjs/react-dom.development.js' : 'react-dom/cjs/react-dom.production.min.js'
      },
      extensions: ['.js', '.jsx', '.json'],
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
      rules: [
        ...devLoaders,
        ...loaders
      ]
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
