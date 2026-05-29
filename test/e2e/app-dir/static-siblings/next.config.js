/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
  },
}

module.exports = nextConfig
