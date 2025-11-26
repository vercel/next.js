/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cpus: 1,
    serverSourceMaps: true,
  },
  serverExternalPackages: ['external-pkg'],
}

module.exports = nextConfig
