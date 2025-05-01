/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  experimental: {
    ppr: false,
    dynamicIO: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
