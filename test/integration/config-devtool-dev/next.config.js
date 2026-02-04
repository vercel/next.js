module.exports = {
  webpack: (config) => {
    config.devtool = 'cheap-module-source-map'
    return config
  },
}
