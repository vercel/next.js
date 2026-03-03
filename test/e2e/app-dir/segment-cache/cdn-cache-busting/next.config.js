/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    validateRSCRequestHeaders: true,
  },
}

module.exports = nextConfig
