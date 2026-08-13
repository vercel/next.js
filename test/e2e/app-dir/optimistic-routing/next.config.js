/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    varyParams: true,
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/config-team',
          destination: '/en/team',
        },
      ],
    }
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
