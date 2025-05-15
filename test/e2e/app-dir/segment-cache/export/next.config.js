/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  experimental: {
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
