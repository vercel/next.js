const webpack = require('webpack')
const nextSourceMaps = require('@zeit/next-source-maps')()

const SENTRY_DSN = ''

module.exports = nextSourceMaps({
  webpack: (config, { dev, isServer, buildId }) => {
    if (!dev) {
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.env.SENTRY_DSN': JSON.stringify(SENTRY_DSN),
          'process.env.SENTRY_RELEASE': JSON.stringify(buildId)
        })
      )
    }

    if (!isServer) {
      config.resolve.alias['@sentry/node'] = '@sentry/browser'
    }

    return config
  }
})
