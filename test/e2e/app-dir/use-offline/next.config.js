/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    useOffline: true,
    varyParams: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

module.exports = nextConfig
