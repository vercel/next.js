require('dotenv').config()

const path = require('path')
const webpack = require('webpack')
const Dotenv = require('dotenv-webpack')

module.exports = {
  webpack: (config, { isServer }) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        __IS_SERVER__: isServer.toString()
      }),
      new Dotenv({
        path: path.join(__dirname, '.env'),
        systemvars: true
      })
    )

    return config
  }
}
