module.exports =
  ({ enabled = true, logLevel, openAnalyzer, analyzerMode } = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        if (enabled) {
          const nextRuntimeOutputPath = options.dev
            ? `../analyze/${options.nextRuntime}.html`
            : `../${options.nextRuntime === 'nodejs' ? '../' : ''}analyze/${
                options.nextRuntime
              }.html`

          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode: analyzerMode || 'static',
              logLevel,
              openAnalyzer,
              reportFilename: !options.nextRuntime
                ? `./analyze/client.html`
                : nextRuntimeOutputPath,
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
