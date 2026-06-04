const path = require('path')
const webpack = require('@rspack/core')
const MODERN_BROWSERSLIST_TARGET = require('./src/shared/lib/modern-browserslist-target')

/**
 * Bundles the production Instant DevTools navigation insights widget into
 * `dist/compiled/next-instant-devtools/index.js`. The widget is required only
 * by client production builds when
 * `experimental.exposeInstantDevToolsInProductionBuild` is enabled (gated by
 * `process.env.__NEXT_EXPOSE_INSTANT_DEVTOOLS`), so the require is dead-code
 * eliminated from normal builds.
 *
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
    entry: path.join(
      __dirname,
      'src/next-instant-devtools-prod/entrypoint.tsx'
    ),
    target,
    mode: 'production',
    output: {
      path: path.join(__dirname, 'dist/compiled/next-instant-devtools'),
      filename: 'index.js',
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
    resolve: {
      alias: {
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
        {
          test: /\.(ts|tsx)$/,
          exclude: [/node_modules/],
          loader: 'builtin:swc-loader',
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
                  runtime: 'automatic',
                },
              },
            },
          },
          type: 'javascript/auto',
        },
      ],
    },
    externals: [],
    ...rest,
  }
}
