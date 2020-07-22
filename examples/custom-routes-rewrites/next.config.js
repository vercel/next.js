module.exports = {
  async rewrites() {
    return [
      {
        source: '/about',
        destination: '/pretty-long-file-name-for-an-about-page',
      },
    ]
  },
}
