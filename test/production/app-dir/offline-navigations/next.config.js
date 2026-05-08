/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    offlineNavigations: true,
  },
}

module.exports = nextConfig
