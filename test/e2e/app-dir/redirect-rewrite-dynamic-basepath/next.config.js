/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath: '/base/path',
  experimental: {
    // Default is true. Set explicitly because the regression under test lives
    // in the cache-busting redirect this flag enables (see base-server.ts).
    validateRSCRequestHeaders: true,
  },
}

module.exports = nextConfig
