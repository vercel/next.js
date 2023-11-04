/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: {
      allowedForwardedHosts: ['safe.com'],
    },
  },
}
