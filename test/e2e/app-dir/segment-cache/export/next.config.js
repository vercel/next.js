/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  experimental: {
    dynamicIO: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
