module.exports =
  ({ enabled = true, logLevel, openAnalyzer, analyzerMode } = {}) =>
  (nextConfig = {}) => {
    if (!enabled) {
      return nextConfig
    }

    const extension = analyzerMode === 'json' ? '.json' : '.html'

    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: analyzerMode || 'static',
            logLevel,
            openAnalyzer,
            reportFilename: !options.nextRuntime
              ? `./analyze/client${extension}`
              : `../${options.nextRuntime === 'nodejs' ? '../' : ''}analyze/${
                  options.nextRuntime
                }${extension}`,
          })
        )

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }
        return config
      },
    })
  }
