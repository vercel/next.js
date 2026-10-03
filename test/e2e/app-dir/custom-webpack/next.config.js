const path = require('path')
const webpack = require('webpack')
const webpackPackageVersion = require('webpack/package.json').version
const { CustomWebpackPlugin } = require('./custom-webpack-plugin')

if (
  process.env.NEXT_PRIVATE_LOCAL_WEBPACK &&
  process.env.EXPECTED_WEBPACK_VERSION &&
  webpackPackageVersion !== process.env.EXPECTED_WEBPACK_VERSION
) {
  throw new Error(
    `Expected config webpack ${process.env.EXPECTED_WEBPACK_VERSION}, received ${webpackPackageVersion}`
  )
}

/** @type {import('next').NextConfig} */
module.exports = {
  webpack(config, { webpack: callbackWebpack }) {
    if (
      process.env.EXPECTED_WEBPACK_VERSION &&
      callbackWebpack.version !== process.env.EXPECTED_WEBPACK_VERSION
    ) {
      throw new Error(
        `Expected callback webpack ${process.env.EXPECTED_WEBPACK_VERSION}, received ${callbackWebpack.version}`
      )
    }

    if (callbackWebpack !== webpack) {
      throw new Error(
        'Webpack callback and config require returned different instances'
      )
    }

    if (process.env.EXPECTED_WEBPACK_VERSION) {
      config.plugins.push(
        new CustomWebpackPlugin(webpackPackageVersion),
        new webpack.NormalModuleReplacementPlugin(
          /^\.\/message$/,
          path.resolve(__dirname, 'app/replacement-message.js')
        )
      )
    }

    return config
  },
}
