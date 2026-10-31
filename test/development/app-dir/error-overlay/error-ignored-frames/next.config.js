/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
