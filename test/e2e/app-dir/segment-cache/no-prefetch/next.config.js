/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    clientSegmentCache: true,
    clientParamParsing: true,
  },
  productionBrowserSourceMaps: true,
}
