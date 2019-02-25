const withBundleAnalyzer = require('@next/bundle-analyzer')

module.exports = withBundleAnalyzer({
  analyzeServer: true,
  analyzeBrowser: true,
  bundleAnalyzerConfig: {
    server: {
      analyzerMode: 'static',
      reportFilename: '../../bundles/server.html'
    },
    browser: {
      analyzerMode: 'static',
      reportFilename: '../bundles/client.html'
    }
  }
})
