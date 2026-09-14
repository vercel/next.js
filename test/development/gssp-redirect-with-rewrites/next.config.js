module.exports = {
  async rewrites() {
    return [
      {
        source: '/alias-to-main-content',
        destination: '/main-content',
      },
    ]
  },
}
