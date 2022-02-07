module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/another',
      },
    ]
  },
}
