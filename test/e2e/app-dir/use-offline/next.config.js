/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    useOffline: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

module.exports = nextConfig
