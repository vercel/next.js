/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    nodeMiddleware: true,
    serverActions: { bodySizeLimit: '2mb' },
  },
}
