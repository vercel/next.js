/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    exposeInstantDevToolsInProductionBuild: true,
  },
}

module.exports = nextConfig
