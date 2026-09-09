/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      // This suite checks build-equivalent static shells, not the separate
      // automatic validation of individual navigation boundaries.
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
