/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    prefetchInlining: false,
  },
}

module.exports = nextConfig
