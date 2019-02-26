module.exports = (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    webpack (config, options) {
      const { isServer } = options
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')

      if (nextConfig.analyze) {
        config.plugins.push(
          new BundleAnalyzerPlugin(
            Object.assign(
              {},
              {
                analyzerMode: 'server',
                analyzerPort: isServer ? 8888 : 8889,
                openAnalyzer: true
              }
            )
          )
        )
      }

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, options)
      }
      return config
    }
  })
}
