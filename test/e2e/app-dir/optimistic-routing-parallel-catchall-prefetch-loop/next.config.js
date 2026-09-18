/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    optimisticRouting: true,
  },
}

module.exports = nextConfig
