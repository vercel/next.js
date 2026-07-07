/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    durableUseCacheEntries: true,
  },
}

module.exports = nextConfig
