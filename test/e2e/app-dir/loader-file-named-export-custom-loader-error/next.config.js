/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  images: {
    loaderFile: '/dummy-loader.ts',
  },
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

module.exports = nextConfig
