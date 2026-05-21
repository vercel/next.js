/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    useOffline: true,
    cachedNavigations: true,
  },
}

module.exports = nextConfig
