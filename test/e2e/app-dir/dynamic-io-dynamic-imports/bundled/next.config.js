/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    ppr: true,
    dynamicIO: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
