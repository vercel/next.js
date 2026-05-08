/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  assetPrefix: 'https://cdn.example.com/app-assets',
  basePath: '/docs',
  experimental: {
    offlineNavigations: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig
