const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin
module.exports = {
  webpack(config) {
    config.plugins = config.plugins || []
    config.plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'disabled',
        generateStatsFile: true,
        statsOptions: {
          chunks: true,
          chunkModules: true,
          modules: true,
        },
      })
    )
    return config
  },
}
