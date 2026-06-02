/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    useOffline: true,
  },
}

module.exports = nextConfig
