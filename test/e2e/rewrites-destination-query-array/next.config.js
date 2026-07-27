module.exports = {
  rewrites() {
    return [
      {
        source: '/some-page',
        destination: '/?items=1&items=2',
      },
    ]
  },
}
