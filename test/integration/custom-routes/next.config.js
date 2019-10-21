module.exports = {
  async rewrites () {
    return [
      {
        source: '/',
        destination: '/another'
      },
      {
        source: '/another',
        destination: '/multi-rewrites'
      },
      {
        source: '/with-params/:path*',
        destination: '/with-params?path=:path'
      },
      {
        source: '/first',
        destination: '/hello'
      },
      {
        source: '/second',
        destination: '/hello-again'
      }
    ]
  },
  async redirects () {
    return [
      {
        source: '/redirect1',
        destination: '/'
      },
      {
        source: '/redirect2',
        destination: '/',
        statusCode: 301
      },
      {
        source: '/redirect3',
        destination: '/another',
        statusCode: 302
      },
      {
        source: '/redirect4',
        destination: '/',
        statusCode: 308
      }
    ]
  }
}
