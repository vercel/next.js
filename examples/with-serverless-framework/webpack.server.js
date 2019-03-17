const path = require('path')
const webpack = require('webpack')
const slsw = require('serverless-webpack')
const nodeExternals = require('webpack-node-externals')

const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  mode: isProd ? 'production' : 'development',

  entry:
    process.env.STAGE === 'local' ? './src/server/next.js' : slsw.lib.entries,

  target: 'node',

  externals: [nodeExternals(), 'aws-sdk'],

  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.next/server'),
    filename: '[name].js'
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                'next/babel',
                {
                  'preset-env': {
                    modules: 'commonjs'
                  }
                }
              ]
            ]
          }
        }
      },
      { test: /\.mjs$/, type: 'javascript/auto', use: [] }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      __STAGE__: JSON.stringify(process.env.STAGE)
    })
  ]
}
