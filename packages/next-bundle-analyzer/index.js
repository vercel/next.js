module.exports =
  (bundleAnalyzerConfig = {}) =>
  (nextConfig = {}) => {
    return Object.assign({}, nextConfig, {
      webpack(config, options) {
        const analyzerConfig =
          typeof bundleAnalyzerConfig === 'function'
            ? bundleAnalyzerConfig(config, options)
            : Object.assign(
                {},
                {
                  enabled: true,
                  openAnalyzer: true,
                  analyzerMode: 'static',
                  reportFilename: options.isServer
                    ? `../analyze/server.html`
                    : `./analyze/client.html`,
                },
                bundleAnalyzerConfig
              )
        if (analyzerConfig.enabled) {
          const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
          config.plugins.push(new BundleAnalyzerPlugin(analyzerConfig))
        }

        if (typeof nextConfig.webpack === 'function') {
          return nextConfig.webpack(config, options)
        }
        return config
      },
    })
  }
