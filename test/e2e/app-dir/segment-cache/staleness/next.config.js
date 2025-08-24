/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cacheComponents: true,
    clientSegmentCache: true,
    staleTimes: {
      dynamic: 30,
    },
  },
}

module.exports = nextConfig
