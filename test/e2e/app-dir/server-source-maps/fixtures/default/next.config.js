/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cpus: 1,
    ppr: true,
    dynamicIO: true,
    enablePrerenderSourceMaps: true,
    serverSourceMaps: true,
  },
  serverExternalPackages: ['external-pkg'],
}

module.exports = nextConfig
