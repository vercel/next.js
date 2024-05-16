/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    prerenderEarlyExit: true,
  },
}

module.exports = nextConfig
