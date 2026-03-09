/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    partialFallbacks: true,
  },
}

module.exports = nextConfig
