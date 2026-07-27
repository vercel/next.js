module.exports = {
  rewrites() {
    return [
      {
        source: '/:hello*',
        destination: '/:hello',
      },
    ]
  },
}
