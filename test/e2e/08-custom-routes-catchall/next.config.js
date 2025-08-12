module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/params',
      },
    ]
  },
}
