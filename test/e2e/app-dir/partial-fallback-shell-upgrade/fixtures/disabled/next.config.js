/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    partialFallbacks: false,
  },
}

module.exports = nextConfig
