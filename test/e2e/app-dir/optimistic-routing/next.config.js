/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
