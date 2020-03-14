module.exports = ({ enabled = true, ...bundleAnalyzerOptions } = {}) => (nextConfig = {}) => {
  return Object.assign({}, nextConfig, {
    webpack(config, options) {
      if (enabled) {
        // compatible with 'next-bundle-analyzer options
        const { analyzeServer, analyzeBrowser } = bundleAnalyzerOptions
        const {
          bundleAnalyzerConfig: { browser = {}, server = {} } = {}
        } = bundleAnalyzerOptions
        
        const { isServer } = options

        if ((isServer && analyzeServer) || (!isServer && analyzeBrowser)) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          config.plugins.push(
            new BundleAnalyzerPlugin(
              Object.assign(
                {},
                {
                  analyzerMode: 'server',
                  analyzerPort: isServer ? 8888 : 8889,
                  openAnalyzer: isServer ? server.openAnalyzer : browser.openAnalyzer
                },
                isServer ? server : browser
              )
            )
          )
        }
      }

      if (typeof nextConfig.webpack === 'function') {
        return nextConfig.webpack(config, options)
      }
      return config
    },
  })
}
