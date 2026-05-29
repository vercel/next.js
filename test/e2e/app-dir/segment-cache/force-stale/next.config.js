/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
