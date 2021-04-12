module.exports = {
  // ensure incorrect target is overridden by env
  target: 'serverless',
  rewrites() {
    return [
      {
        source: '/some-catch-all/:path*',
        destination: '/',
      },
    ]
  },
}
