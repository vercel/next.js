module.exports = function makeBundleAnalyzer({
  enabled = true,
  openAnalyzer,
  analyzerMode,
} = {}) {
  if (!enabled) {
    const identity = (it) => it
    return identity
  }
  return (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
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

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }
        return config
      },
    })
  }
}
