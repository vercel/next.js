module.exports =
  ({ enabled = true, logLevel, openAnalyzer, analyzerMode } = {}) =>
  (nextConfig = {}) => {
    if (!enabled) {
      return nextConfig
    }
    if (process.env.TURBOPACK) {
      console.warn(
        'The Next Bundle Analyzer is not compatible with Turbopack builds yet, no report will be generated.\n\n' +
          'To run this analysis pass the `--webpack` flag to `next build`'
      )
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
