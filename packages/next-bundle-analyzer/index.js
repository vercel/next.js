module.exports =
  ({ enabled = true, openAnalyzer = true, analyzerMode = 'static' } = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        if (enabled) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          const reportFileExtension = analyzerMode === 'json' ? 'json' : 'html'
          config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode,
              openAnalyzer,
              reportFilename: options.isServer
                ? `../analyze/server.${reportFileExtension}`
                : `./analyze/client.${reportFileExtension}`,
            })
          )
        }

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }
        return config
      },
    })
  }
