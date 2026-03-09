const path = require('path')
const webpack = require('@rspack/core')
const MODERN_BROWSERSLIST_TARGET = require('./src/shared/lib/modern-browserslist-target')
const DevToolsIgnoreListPlugin = require('./webpack-plugins/devtools-ignore-list-plugin')

function shouldIgnorePath() {
  return true
}

/**
 * @param {Object} options
 * @param {boolean} options.dev
 * @param {Partial<webpack.Configuration>} options.rest
 * @returns {webpack.Configuration}
 */
module.exports = ({ dev, ...rest }) => {
  const target = `browserslist:${MODERN_BROWSERSLIST_TARGET.join(', ')}`

  return {
    entry: path.join(__dirname, 'src/next-react-devtools/frontend.tsx'),
    target,
    mode: dev ? 'development' : 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/next-react-devtools'),
      filename: 'frontend.js',
      iife: true,
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
    plugins: [new DevToolsIgnoreListPlugin({ shouldIgnorePath })].filter(
      Boolean
    ),
    stats: {
      optimizationBailout: true,
    },
    resolve: {
      alias: {
        // react-devtools-inline uses experimental React features.
        react: `next/dist/compiled/react-experimental`,
        'react-dom$': `next/dist/compiled/react-dom-experimental`,
        'react-dom/client$': `next/dist/compiled/react-dom-experimental/client`,
        'react-is$': `next/dist/compiled/react-is`,
        scheduler$: `next/dist/compiled/scheduler-experimental`,
      },
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    module: {
      rules: [
        { test: /\.m?js$/, loader: 'source-map-loader', enforce: 'pre' },
        {
          test: /\.(ts|tsx)$/,
          exclude: [/node_modules/],
          loader: 'builtin:swc-loader',
          /** @type {import('@rspack/core').SwcLoaderOptions} */
          options: {
            env: {
              targets: MODERN_BROWSERSLIST_TARGET,
            },
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              transform: {
                react: {
                  development: dev,
                  runtime: 'automatic',
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
                /** @type {import('babel-plugin-react-compiler').PluginOptions} */
                ({
                  environment: {
                    enableNameAnonymousFunctions: dev,
                  },
                }),
              ],
              ['@babel/plugin-syntax-typescript', { isTSX: true }],
            ],
            sourceMaps: true,
          },
          type: 'javascript/auto',
        },
      ],
    },
    externals: [],
    experiments: {},
    ...rest,
  }
}
