/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  experimental: {
    logging: {
      level: 'verbose',
    },
    serverActions: true,
  },
}
