module.exports = {
  webpack: function (config) {
    config.resolve.alias = {
      'react': 'inferno-compat',
      'react-dom': 'inferno-compat'
    }
    return config
  }
}
