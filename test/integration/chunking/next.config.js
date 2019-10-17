const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin
module.exports = {
  experimental: {
    granularChunks: true
  },
  webpack (config, { isServer }) {
    config.plugins = config.plugins || []
    config.plugins.push(
      isServer
        ? new BundleAnalyzerPlugin({
          analyzerMode: 'disabled',
          generateStatsFile: true
        })
        : new BundleAnalyzerPlugin()
    )
    return config
  },
  assetPrefix: 'http://localhost:3333'
}
