const withSourceMaps = require('@zeit/next-source-maps')()

module.exports = withSourceMaps({
  webpack (config, _options) {
    return config
  }
})
