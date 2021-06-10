module.exports = {
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/some-page',
      },
    ]
  },
}
