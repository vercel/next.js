/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    requestInsights: true,
  },
}

module.exports = nextConfig
