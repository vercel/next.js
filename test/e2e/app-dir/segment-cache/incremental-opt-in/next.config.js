/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: true,
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
