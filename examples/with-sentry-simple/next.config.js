const withSourceMaps = require('@zeit/next-source-maps')()

module.exports = withSourceMaps({
  env: {
    SENTRY_DSN: 'hello-world',
    // would want to synchronously grab git commit id here for
    // best debugging experience
    SENTRY_RELEASE: '0.0.1'
  }
})
