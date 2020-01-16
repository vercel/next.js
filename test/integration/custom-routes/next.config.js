module.exports = {
  // target: 'serverless',
  experimental: {
    async rewrites() {
      return [
        {
          source: '/to-another',
          destination: '/another/one',
        },
        {
          source: '/hello-world',
          destination: '/static/hello.txt',
        },
        {
          source: '/',
          destination: '/another',
        },
        {
          source: '/another',
          destination: '/multi-rewrites',
        },
        {
          source: '/first',
          destination: '/hello',
        },
        {
          source: '/second',
          destination: '/hello-again',
        },
        {
          source: '/to-hello',
          destination: '/hello',
        },
        {
          source: '/blog/post-1',
          destination: '/blog/post-2',
        },
        {
          source: '/test/:path',
          destination: '/:path',
        },
        {
          source: '/test-overwrite/:something/:another',
          destination: '/params/this-should-be-the-value',
        },
        {
          source: '/params/:something',
          destination: '/with-params',
        },
        {
          source: '/query-rewrite/:section/:name',
          destination: '/with-params?first=:section&second=:name',
        },
        {
          source: '/hidden/_next/:path*',
          destination: '/_next/:path*',
        },
      ]
    },
    async redirects() {
      return [
        {
          source: '/docs/router-status/:code',
          destination: '/docs/v2/network/status-codes#:code',
          statusCode: 301,
        },
        {
          source: '/docs/github',
          destination: '/docs/v2/advanced/now-for-github',
          statusCode: 301,
        },
        {
          source: '/docs/v2/advanced/:all(.*)',
          destination: '/docs/v2/more/:all',
          statusCode: 301,
        },
        {
          source: '/hello/:id/another',
          destination: '/blog/:id',
          permanent: false,
        },
        {
          source: '/redirect1',
          destination: '/',
          permanent: false,
        },
        {
          source: '/redirect2',
          destination: '/',
          statusCode: 301,
        },
        {
          source: '/redirect3',
          destination: '/another',
          statusCode: 302,
        },
        {
          source: '/redirect4',
          destination: '/',
          permanent: true,
        },
        {
          source: '/redir-chain1',
          destination: '/redir-chain2',
          statusCode: 301,
        },
        {
          source: '/redir-chain2',
          destination: '/redir-chain3',
          statusCode: 302,
        },
        {
          source: '/redir-chain3',
          destination: '/',
          statusCode: 303,
        },
        {
          source: '/to-external',
          destination: 'https://google.com',
          permanent: false,
        },
        {
          source: '/query-redirect/:section/:name',
          destination: '/with-params?first=:section&second=:name',
          permanent: false,
        },
        {
          source: '/unnamed/(first|second)/(.*)',
          destination: '/:1/:2',
          permanent: false,
        },
        {
          source: '/named-like-unnamed/:0',
          destination: '/:0',
          permanent: false,
        },
      ]
    },

    async headers() {
      return [
        {
          source: '/add-header',
          headers: [
            {
              key: 'x-custom-header',
              value: 'hello world',
            },
            {
              key: 'x-another-header',
              value: 'hello again',
            },
          ],
        },
        {
          source: '/my-headers/(.*)',
          headers: [
            {
              key: 'x-first-header',
              value: 'first',
            },
            {
              key: 'x-second-header',
              value: 'second',
            },
          ],
        },
      ]
    },
  },
}
