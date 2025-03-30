/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    dynamicIO: true,
    serverSourceMaps: true,
  },
  serverExternalPackages: ['external-pkg'],
}

module.exports = nextConfig
