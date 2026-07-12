/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: 'build',
  experimental: {
    requestInsights: true,
  },
}

module.exports = nextConfig
