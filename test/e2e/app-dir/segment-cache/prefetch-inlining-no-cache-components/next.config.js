/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: false,
  experimental: {
    prefetchInlining: true,
    cachedNavigations: false,
  },
}

module.exports = nextConfig
