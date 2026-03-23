/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cachedNavigations: true,
  },
}

module.exports = nextConfig
