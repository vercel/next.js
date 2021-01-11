module.exports = ({ enabled = true, ...bundleAnalyzerOptions } = {}) => (
  nextConfig = {}
) => {
  return Object.assign({}, nextConfig, {
    webpack(config, options) {
      if (enabled) {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
        config.plugins.push(
          new BundleAnalyzerPlugin({
            ...bundleAnalyzerOptions,
            analyzerMode: 'static',
            reportFilename: options.isServer
              ? '../analyze/server.html'
              : './analyze/client.html',
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
