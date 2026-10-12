/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: 'build',
  cacheComponents: true,
  experimental: {
    requestInsights: true,
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
