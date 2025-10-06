/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
  },
  logging: {
    fetches: {
      hmrRefreshes: true,
    },
  },
}

module.exports = nextConfig
