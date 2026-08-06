module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/another',
      },
      {
        source: '/blog/:slugs*',
        destination: '/news/:slugs*',
      },
    ]
  },
}
