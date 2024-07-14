/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    after: true,
    serverComponentsHmrCache: true,
  },
}

module.exports = nextConfig
