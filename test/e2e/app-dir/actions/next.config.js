/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: {
      allowedForwardingHosts: ['safe.com'],
    },
  },
}
