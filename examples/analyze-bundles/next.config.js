const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig = {
  // any configs you need
  webpack(config) {
    // any customized webpack config
    // https://nextjs.org/docs#customizing-webpack-config
    return config
  },
}

module.exports = withBundleAnalyzer(nextConfig)
