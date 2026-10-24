/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  compiler: {
    define: {
      __MY_FLAG__: false,
    },
  },
  productionBrowserSourceMaps: true,
}

module.exports = nextConfig
