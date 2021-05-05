const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
module.exports = {
  webpack(config, { isServer }) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: `dist/${isServer ? 'server' : 'client'}.html`,
        openAnalyzer: false,
      })
    )
    return config
  },
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
}
