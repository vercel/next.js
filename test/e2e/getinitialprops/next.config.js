module.exports = {
  async rewrites() {
    return [
      {
        source: '/blog/post/:pid',
        destination: '/blog/:pid',
      },
    ]
  },
}
