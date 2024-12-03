/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    serverSourceMaps: true,
    prerenderEarlyExit: false,
  },
}

module.exports = nextConfig
