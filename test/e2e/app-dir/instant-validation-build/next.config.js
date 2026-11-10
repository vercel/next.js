/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
