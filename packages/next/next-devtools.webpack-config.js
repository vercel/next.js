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
  const turbo = false

  const bundledReactChannel = experimental ? '-experimental' : ''

  const target = `browserslist:${MODERN_BROWSERSLIST_TARGET.join(', ')}`

  return {
    entry: path.join(
      __dirname,
      'src/client/components/react-dev-overlay/entrypoint.js'
    ),
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
      new webpack.DefinePlugin({
        // TODO: Hardcode it and ensure module resolution resolves to .node entrypoint in Node.js
        // 'typeof window': JSON.stringify('object'),
        'process.env.NEXT_MINIMAL': JSON.stringify('true'),
        'this.serverOptions.experimentalTestProxy': JSON.stringify(false),
        'this.minimalMode': JSON.stringify(true),
        'this.renderOpts.dev': JSON.stringify(dev),
        'renderOpts.dev': JSON.stringify(dev),
        'process.env.NODE_ENV': JSON.stringify(
          dev ? 'development' : 'production'
        ),
        'process.env.__NEXT_EXPERIMENTAL_REACT': JSON.stringify(
          experimental ? true : false
        ),
        'process.env.NEXT_RUNTIME': JSON.stringify('nodejs'),
        'process.turbopack': JSON.stringify(turbo),
        'process.env.TURBOPACK': JSON.stringify(turbo),
      }),
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
      ],
    },
    externals: [],
    experiments: {},
    ...rest,
  }
}
