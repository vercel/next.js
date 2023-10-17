module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/',
      },
      {
        source: '/rewrite-me-dynamic',
        destination: '/first',
      },
    ]
  },
}
