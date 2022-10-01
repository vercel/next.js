const { StatsWriterPlugin } = require('webpack-stats-plugin')
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

module.exports = {
  experimental: {
    appDir: true,
  },
  webpack: (config, options) => {
    const { nextRuntime = 'client' } = options
    if (process.env.ANALYZE) {
      if (nextRuntime === 'edge')
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: true,
            reportFilename: options.isServer
              ? '../analyze/server.html'
              : './analyze/client.html',
          })
        )
      config.plugins.push(
        new StatsWriterPlugin({
          filename: `../webpack-stats-${nextRuntime}.json`,
          stats: {
            assets: true,
            chunks: true,
            modules: true,
          },
        })
      )
    }
    return config
  },
}
