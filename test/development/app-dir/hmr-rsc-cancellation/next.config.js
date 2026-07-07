/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    serverComponentsHmrCancellation: true,
  },
}

module.exports = nextConfig
