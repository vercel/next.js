module.exports = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/base/:path*',
          destination: '/:path*',
        },
      ],
    }
  },
}
