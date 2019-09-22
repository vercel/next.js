const path = require('path')

module.exports = {
  webpack (config, options) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@src': path.join(__dirname, './')
    }
    return config
  }
}
