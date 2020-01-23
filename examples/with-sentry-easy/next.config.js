const withSourceMaps = require('@zeit/next-source-maps')

module.exports = withSourceMaps({
  env: {
    SENTRY_DSN: '', // your sentry dsn
  },
  webpack: (config, options) => {
    if (!options.isServer) {
      config.resolve.alias['@sentry/node'] = '@sentry/browser'
    }

    return config
  },
})
