/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: true,
    optimisticRouting: true,
  },
}

module.exports = nextConfig
