/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
