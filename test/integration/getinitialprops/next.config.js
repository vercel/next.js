module.exports = {
  // replace me
  async rewrites() {
    return [
      {
        source: '/blog/post/:pid',
        destination: '/blog/:pid',
      },
    ]
  },
}
