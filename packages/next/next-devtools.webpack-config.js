const path = require('path')
const webpack = require('@rspack/core')
const MODERN_BROWSERSLIST_TARGET = require('./src/shared/lib/modern-browserslist-target')
const DevToolsIgnoreListPlugin = require('./webpack-plugins/devtools-ignore-list-plugin')

function shouldIgnorePath(modulePath) {
  // For consumers, everything will be considered 3rd party dependency if they use
  // the bundles we produce here.
  // In other words, this is all library code and should therefore be ignored.
  return true
}

/**
 * @param {Object} options
 * @param {boolean} options.dev
 * @param {Partial<webpack.Configuration>} options.rest
 * @returns {webpack.Configuration}
 */
module.exports = ({ dev, ...rest }) => {
  const experimental = false

  const bundledReactChannel = experimental ? '-experimental' : ''

  const target = `browserslist:${MODERN_BROWSERSLIST_TARGET.join(', ')}`

  return {
    entry: path.join(__dirname, 'src/next-devtools/entrypoint.ts'),
    target,
    mode: dev ? 'development' : 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/next-devtools'),
      filename: `index.js`,
      iife: false,
      library: {
        type: 'commonjs-static',
      },
    },
    devtool: 'source-map',
    optimization: {
      moduleIds: 'named',
      minimize: true,
      concatenateModules: true,
      minimizer: [
        new webpack.SwcJsMinimizerRspackPlugin({
          minimizerOptions: {
            mangle: dev || process.env.NEXT_SERVER_NO_MANGLE ? false : true,
          },
        }),
      ],
    },
    plugins: [
      // TODO: React Compiler
      new DevToolsIgnoreListPlugin({ shouldIgnorePath }),
    ].filter(Boolean),
    stats: {
      optimizationBailout: true,
    },
    resolve: {
      alias: {
        // TODO: Get dedicated React version for NDT to uncouple development.
        react: `next/dist/compiled/react${bundledReactChannel}`,
        'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}`,
        'react-dom/client$': `next/dist/compiled/react-dom${bundledReactChannel}/client`,
        'react-is$': `next/dist/compiled/react-is${bundledReactChannel}`,
        scheduler$: `next/dist/compiled/scheduler${bundledReactChannel}`,
      },
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    module: {
      rules: [
        { test: /\.m?js$/, loader: `source-map-loader`, enforce: `pre` },
        {
          test: /\.(ts|tsx)$/,
          exclude: [/node_modules/],
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              transform: {
                react: {
                  development: dev,
                  runtime: 'automatic',
                  // TODO: Fast Refresh
                  // refresh: dev,
                },
              },
            },
          },
          type: 'javascript/auto',
        },
        {
          test: /\.(ts|tsx)$/,
          exclude: [/node_modules/],
          loader: 'babel-loader',
          options: {
            plugins: [
              [
                'babel-plugin-react-compiler',
                /**
                 * @type {import('babel-plugin-react-compiler').PluginOptions}
                 */
                ({}),
              ],
              ['@babel/plugin-syntax-typescript', { isTSX: true }],
            ],
            sourceMaps: true,
          },
          type: 'javascript/auto',
        },
        {
          test: /\.css$/,
          use: [
            {
              loader: 'style-loader',
              options: {
                // Explicitly set the injectType to 'styleTag' which is also the default behavior.
                // We've experienced `singletonStyleTag` that the later updated styles not being applied.
                // Keep using `styleTag` to ensure when new styles injected the style can also be updated.
                injectType: 'styleTag',
                insert: require.resolve(
                  './src/build/webpack/loaders/devtool/devtool-style-inject.js'
                ),
              },
            },
            { loader: 'css-loader', options: { sourceMap: false } },
          ],
        },
      ],
    },
    externals: [],
    experiments: {},
    ...rest,
  }
}
