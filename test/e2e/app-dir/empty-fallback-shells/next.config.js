/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    ppr: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
