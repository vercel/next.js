/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    optimisticRouting: true,
    prefetchInlining: false,
    varyParams: true,
  },
}

module.exports = nextConfig
