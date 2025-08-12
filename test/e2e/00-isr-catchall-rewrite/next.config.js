module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/ebay/:path*',
      },
    ]
  },
}
