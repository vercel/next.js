module.exports = {
  async rewrites() {
    return [
      {
        source: '/team',
        destination: '/about',
      },
      {
        source: '/about-us',
        destination: '/about',
      },
      {
        source: '/docs/:slug',
        destination: 'http://example.com/docs/:slug',
      },
    ]
  },
}
