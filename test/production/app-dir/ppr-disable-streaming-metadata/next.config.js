/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: 'incremental',
    streamingMetadata: true,
  },
}

module.exports = nextConfig
