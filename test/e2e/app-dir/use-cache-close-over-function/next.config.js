/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    serverSourceMaps: true,
  },
}

module.exports = nextConfig
