/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    streamingMetadata: true,
  },
}

module.exports = nextConfig
