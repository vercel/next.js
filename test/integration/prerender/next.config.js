module.exports = {
  target: 'serverless',
  rewrites() {
    return [
      {
        source: '/about',
        destination: '/lang/en/about',
      },
    ]
  },
}
