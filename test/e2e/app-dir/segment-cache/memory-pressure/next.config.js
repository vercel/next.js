/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
