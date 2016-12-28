module.exports = {
  webpack: function (config) {
    config.resolve.alias = {
      'react': 'preact-compat',
      'react-dom': 'preact-compat'
    }
    return config
  }
}
