/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    varyParams: true,
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
