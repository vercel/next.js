/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    serverSourceMaps: true,
  },
}

module.exports = nextConfig
