/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cpus: 1,
    serverSourceMaps: true,
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
