/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    clientSegmentCache: true,
    validateRSCRequestHeaders: true,
  },
}

module.exports = nextConfig
