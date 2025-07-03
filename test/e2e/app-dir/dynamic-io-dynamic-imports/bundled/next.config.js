/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
