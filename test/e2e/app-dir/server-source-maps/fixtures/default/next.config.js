/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cpus: 1,
    cacheComponents: true,
    serverSourceMaps: true,
  },
  serverExternalPackages: ['external-pkg'],
}

module.exports = nextConfig
