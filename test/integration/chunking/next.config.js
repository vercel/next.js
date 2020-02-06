const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin
module.exports = {
  assetPrefix: '/foo/',
  webpack(config) {
    config.plugins = config.plugins || []
    config.plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'disabled',
        generateStatsFile: true,
      })
    )
    return config
  },
}
