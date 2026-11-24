/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: 'build',
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
