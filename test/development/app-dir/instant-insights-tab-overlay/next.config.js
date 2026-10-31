/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: { validationLevel: 'experimental-error' },
  },
}

module.exports = nextConfig
