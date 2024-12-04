module.exports = {
  assetPrefix: '/custom-asset-prefix',
  basePath: '/custom-base-path',
  async rewrites() {
    return [
      {
        source: '/custom-asset-prefix/:path*',
        destination: '/:path*',
      },
      {
        source: '/not-custom-asset-prefix/:path*',
        destination: '/:path*',
      },
    ]
  },
}
