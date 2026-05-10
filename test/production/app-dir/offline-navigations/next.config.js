/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  assetPrefix: '/app-assets',
  basePath: '/docs',
  experimental: {
    exposeTestingApiInProductionBuild: true,
    offlineNavigations: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig
