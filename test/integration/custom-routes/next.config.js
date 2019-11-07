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
        source: '/first',
        destination: '/hello'
      },
      {
        source: '/second',
        destination: '/hello-again'
      },
      {
        source: '/something',
        destination: '/blog/something'
      }
    ]
  },
  async redirects () {
    return [
      {
        source: '/hello/:id/another',
        destination: '/blog/:id'
      },
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
      },
      {
        source: '/redir-chain1',
        destination: '/redir-chain2',
        statusCode: 301
      },
      {
        source: '/redir-chain2',
        destination: '/redir-chain3',
        statusCode: 302
      },
      {
        source: '/redir-chain3',
        destination: '/',
        statusCode: 303
      }
    ]
  }
}
