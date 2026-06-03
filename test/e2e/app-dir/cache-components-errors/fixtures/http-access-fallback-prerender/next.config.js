/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    authInterrupts: true,
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
