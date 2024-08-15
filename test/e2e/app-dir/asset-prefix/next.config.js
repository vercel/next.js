module.exports = {
  assetPrefix: '/custom-asset-prefix',
  async rewrites() {
    return {
      afterFiles: [
        {
          source: '/custom-asset-prefix/:path*',
          destination: '/:path*',
        },
        {
          source: '/not-custom-asset-prefix/:path*',
          destination: '/:path*',
        },
      ],
    }
  },
}
