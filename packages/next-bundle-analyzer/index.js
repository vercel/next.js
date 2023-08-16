module.exports =
  ({ enabled = true, openAnalyzer, analyzerMode } = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        if (enabled) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode: analyzerMode || 'static',
              openAnalyzer,
              reportFilename: !options.nextRuntime
                ? `./analyze/client.html`
                : `../${options.nextRuntime === 'nodejs' ? '../' : ''}analyze/${
                    options.nextRuntime
                  }.html`,
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
