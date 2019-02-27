module.exports = pluginOptions => (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    webpack (config, options) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

      if (pluginOptions.enabled) {
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: options.isServer ? '../analyze/server.html' : './analyze/client.html'
          })
        )
      }

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, options)
      }
      return config
    }
  })
}
