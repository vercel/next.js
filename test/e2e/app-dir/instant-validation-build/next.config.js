/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instant: {
      defaultValidationLevel: 'error',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
