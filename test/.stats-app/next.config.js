const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: !!process.env.TEST_ANALYZE,
})

module.exports = withBundleAnalyzer({
  experimental: {
    appDir: true,
  },
})
