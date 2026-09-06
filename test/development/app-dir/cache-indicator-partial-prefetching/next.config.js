/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    coldCacheBadge: true,
  },
}

module.exports = nextConfig
