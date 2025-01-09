/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
