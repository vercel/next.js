const {
  WebpackBundleSizeAnalyzerPlugin
} = require('webpack-bundle-size-analyzer')
const { ANALYZE } = process.env

module.exports = {
  webpack: function (config) {
    if (ANALYZE) {
      config.plugins.push(new WebpackBundleSizeAnalyzerPlugin('stats.txt'))
    }

    return config
  }
}
