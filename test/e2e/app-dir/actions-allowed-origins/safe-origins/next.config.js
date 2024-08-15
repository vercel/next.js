/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  logging: {
    fetches: {},
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:' + process.env.PORT],
    },
  },
}
