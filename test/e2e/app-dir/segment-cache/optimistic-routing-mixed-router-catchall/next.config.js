/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    varyParams: true,
  },
}

module.exports = nextConfig
