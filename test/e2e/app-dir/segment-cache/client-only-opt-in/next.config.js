/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: true,
    clientSegmentCache: 'client-only',
  },
}

module.exports = nextConfig
