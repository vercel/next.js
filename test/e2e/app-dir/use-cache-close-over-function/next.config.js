/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    ppr: true,
    serverSourceMaps: true,
  },
}

module.exports = nextConfig
