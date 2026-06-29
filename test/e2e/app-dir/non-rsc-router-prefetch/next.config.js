/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
}

module.exports = nextConfig
