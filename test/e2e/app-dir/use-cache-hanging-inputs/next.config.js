/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    prerenderEarlyExit: false,
    ppr: true,
  },
}

module.exports = nextConfig
