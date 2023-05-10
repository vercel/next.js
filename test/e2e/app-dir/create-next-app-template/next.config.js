const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {}

// module.exports = nextConfig
module.exports = withBundleAnalyzer(nextConfig)
