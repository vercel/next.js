const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // any configs you need
}

module.exports = withBundleAnalyzer(nextConfig)
