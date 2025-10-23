/** @type {import('next').NextConfig} */
const config = {
  experimental: {
    serverMinification: true,
    turbopackSourceMaps: true,
  },
  productionBrowserSourceMaps: true,
}

module.exports = config
