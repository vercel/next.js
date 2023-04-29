/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: { appDir: true },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
