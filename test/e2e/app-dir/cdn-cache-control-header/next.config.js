/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cdnCacheControlHeader: 'Surrogate-Control',
  },
}

module.exports = nextConfig
