/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    instant: {
      defaultValidationLevel: 'disabled',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
