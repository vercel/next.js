module.exports =
  ({ enabled = true, logLevel, openAnalyzer, analyzerMode } = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        if (enabled) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          const fileExtension = analyzerMode === 'json' ? '.json' : '.html'
          config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode: analyzerMode || 'static',
              logLevel,
              openAnalyzer,
              reportFilename: !options.nextRuntime
                ? `./analyze/client${fileExtension}`
                : `../${options.nextRuntime === 'nodejs' ? '../' : ''}analyze/${
                    options.nextRuntime
                  }${fileExtension}`,
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
