/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    cpus: 1,
    serverSourceMaps: true,
  },
  serverExternalPackages: ['@next-test-server-source-maps/external-pkg'],
}

module.exports = nextConfig
