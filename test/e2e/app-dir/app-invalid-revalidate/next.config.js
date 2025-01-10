/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
