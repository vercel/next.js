const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer')
module.exports = {
  webpack (config, {isServer}) {
    config.plugins.push(new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: `dist/${isServer ? 'server' : 'client'}.html`,
      openAnalyzer: false
    }))
    return config
  },
  contentSecurityPolicy: "default-src 'none'; script-src 'self'; style-src 'nonce-{style-nonce}' 'unsafe-inline';connect-src 'self';img-src 'self';",
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60
  }
}
