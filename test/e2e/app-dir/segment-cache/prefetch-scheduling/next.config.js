/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
