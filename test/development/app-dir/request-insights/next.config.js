/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  distDir: 'build',
  logging: {
    serverFunctions: false,
  },
  experimental: {
    requestInsights: true,
  },
}

module.exports = nextConfig
