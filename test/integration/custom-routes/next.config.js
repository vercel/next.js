module.exports = {
  async rewrites () {
    return [
      {
        source: '/',
        destination: '/another'
      },
      {
        source: '/another',
        destination: '/one-more'
      },
      {
        source: '/hello/:path*',
        destination: '/?path=:path'
      }
    ]
  }
}
