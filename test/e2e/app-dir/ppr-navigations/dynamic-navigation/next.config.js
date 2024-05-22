/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    ppr: true,
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
