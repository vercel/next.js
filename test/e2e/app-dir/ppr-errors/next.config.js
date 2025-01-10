/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
