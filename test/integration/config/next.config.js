const withCSS = require('@zeit/next-css')
const webpack = require('webpack')
module.exports = withCSS({
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  },
  cssModules: true,
  serverRuntimeConfig: {
    mySecret: 'secret'
  },
  publicRuntimeConfig: {
    staticFolder: '/static'
  },
  webpack (config, {buildId}) {
    config.plugins.push(
      new webpack.DefinePlugin({
        'process.env.CONFIG_BUILD_ID': JSON.stringify(buildId)
      })
    )

    return config
  }
})
