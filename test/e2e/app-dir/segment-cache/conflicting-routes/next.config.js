/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
    clientSegmentCache: true,
  },
}

module.exports = nextConfig
