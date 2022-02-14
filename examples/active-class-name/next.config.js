module.exports = {
  async rewrites() {
    return [
      {
        source: '/blog',
        destination: '/news',
      },
    ]
  },
}
