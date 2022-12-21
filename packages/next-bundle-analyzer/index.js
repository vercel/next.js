module.exports =
  ({ enabled = true, openAnalyzer = true } = {}) =>
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
              analyzerMode: 'static',
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
