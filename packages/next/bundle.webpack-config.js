/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line no-unused-vars
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
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
 * @param {webpack.Configuration['entry']} options.entry
 * @param {webpack.Configuration['output']} options.output
 * @param {boolean} options.mangle
 * @param {Partial<webpack.Configuration>} options.rest
 * @returns {webpack.Configuration}
 */
module.exports = ({ dev, entry, output, mangle, ...rest }) => {
  return {
    entry,
    target: 'node',
    mode: dev ? 'development' : 'production',
    output,
    devtool: 'source-map',
    optimization: {
      moduleIds: 'named',
      minimize: true,
      concatenateModules: true,
      minimizer: [
        new TerserPlugin({
          minify: TerserPlugin.swcMinify,
          terserOptions: {
            compress: {
              dead_code: true,
              // Zero means no limit.
              passes: 0,
            },
            format: {
              preamble: '',
            },
            mangle: mangle || dev,
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
    // FIXME: Are these sufficient?
    externals: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      'react-dom/server',
    ],
    experiments: {
      layers: true,
      outputModule: true,
    },
    ...rest,
  }
}
