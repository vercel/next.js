/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    clientSegmentCache: true,
    staleTimes: {
      dynamic: 30,
    },
  },
}

module.exports = nextConfig
