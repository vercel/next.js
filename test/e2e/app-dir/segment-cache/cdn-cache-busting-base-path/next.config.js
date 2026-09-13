/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath: '/docs',
  experimental: {
    validateRSCRequestHeaders: true,
  },
}

module.exports = nextConfig
