module.exports = {
  // replace me
  async rewrites() {
    return [
      {
        source: '/blog-post-1',
        destination: '/blog/post-1',
      },
      {
        source: '/blog-post-2',
        destination: '/blog/post-2?hello=world',
      },
      {
        source: '/blog-:param',
        destination: '/blog/post-3',
      },
    ]
  },
}
