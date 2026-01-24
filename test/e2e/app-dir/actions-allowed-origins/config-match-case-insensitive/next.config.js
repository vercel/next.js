const { CONFIG_ALLOWED_ORIGINS } = require('./domain')

/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: {
      allowedOrigins: CONFIG_ALLOWED_ORIGINS,
    },
  },
}
