/** @type {import('next').NextConfig} */
module.exports = {
  // output: 'standalone',
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
}
