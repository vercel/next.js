module.exports = {
  webpack(config, options) {
    if (!options.isServer) {
      config.profile = true
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          generateStatsFile: true,
          analyzerMode: 'static',
          reportFilename: options.isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      )
    }

    return config
  },
}
