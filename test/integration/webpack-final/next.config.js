module.exports = {
  webpack(config) {
    console.log('webpack config - entry type:', typeof config.entry)
    return config
  },
  webpackFinal(config) {
    console.log('webpackFinal config - entry type:', typeof config.entry)
    return config
  },
}
