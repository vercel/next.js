module.exports =
  ({ enabled = true, analyzerMode = 'static', ...analyzerOptions } = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        if (enabled) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode,
              reportFilename: !options.nextRuntime
                ? `./analyze/client.${
                    analyzerMode === 'static' ? 'html' : 'json'
                  }`
                : `../${options.nextRuntime === 'nodejs' ? '../' : ''}analyze/${
                    options.nextRuntime
                  }.${analyzerMode === 'static' ? 'html' : 'json'}`,
              ...analyzerOptions,
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
