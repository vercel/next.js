/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
    clientSegmentCache: 'client-only',
  },
}

module.exports = nextConfig
