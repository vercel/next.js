/** @type {import('next').NextConfig} */
module.exports = {
  productionBrowserSourceMaps: true,
  experimental: {
    logging: 'verbose',
    serverActions: true,
  },
}
