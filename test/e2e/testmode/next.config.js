module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-1',
        destination: 'https://example.com',
      },
    ]
  },
}
