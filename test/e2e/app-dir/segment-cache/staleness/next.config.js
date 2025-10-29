/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    clientSegmentCache: true,
    staleTimes: {
      dynamic: 30,
    },
  },
}

module.exports = nextConfig
