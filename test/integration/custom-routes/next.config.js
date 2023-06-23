module.exports = {
  experimental: {
    caseSensitiveRoutes: true,
  },
  async rewrites() {
    // no-rewrites comment
    return {
      afterFiles: [
        ...(process.env.ADD_NOOP_REWRITE === 'true'
          ? [
              {
                source: '/:path*',
                destination: '/:path*',
              },
            ]
          : []),
        {
          source: '/to-websocket',
          destination:
            'http://localhost:__EXTERNAL_PORT__/_next/webpack-hmr?page=/about',
        },
        {
          source: '/websocket-to-page',
          destination: '/hello',
        },
        {
          source: '/to-nowhere',
          destination: 'http://localhost:12233',
        },
        {
          source: '/rewriting-to-auto-export',
          destination: '/auto-export/hello?rewrite=1',
        },
        {
          source: '/rewriting-to-another-auto-export/:path*',
          destination: '/auto-export/another?rewrite=1',
        },
        {
          source: '/to-another',
          destination: '/another/one',
        },
        {
          source: '/nav',
          destination: '/404',
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
        {
          source: '/proxy-me/:path*',
          destination: 'http://localhost:__EXTERNAL_PORT__/:path*',
        },
        {
          source: '/api-hello',
          destination: '/api/hello',
        },
        {
          source: '/api-hello-regex/:first(.*)',
          destination: '/api/hello?name=:first*',
        },
        {
          source: '/api-hello-param/:name',
          destination: '/api/hello?hello=:name',
        },
        {
          source: '/api-dynamic-param/:name',
          destination: '/api/dynamic/:name?hello=:name',
        },
        {
          source: '/:path/post-321',
          destination: '/with-params',
        },
        {
          source: '/unnamed-params/nested/(.*)/:test/(.*)',
          destination: '/with-params',
        },
        {
          source: '/catchall-rewrite/:path*',
          destination: '/with-params',
        },
        {
          source: '/catchall-query/:path*',
          destination: '/with-params?another=:path*',
        },
        {
          source: '/has-rewrite-1',
          has: [
            {
              type: 'header',
              key: 'x-my-header',
              value: '(?<myHeader>.*)',
            },
          ],
          destination: '/with-params?myHeader=:myHeader',
        },
        {
          source: '/has-rewrite-2',
          has: [
            {
              type: 'query',
              key: 'my-query',
            },
          ],
          destination: '/with-params?value=:myquery',
        },
        {
          source: '/has-rewrite-3',
          has: [
            {
              type: 'cookie',
              key: 'loggedIn',
              value: '(?<loggedIn>true)',
            },
          ],
          destination: '/with-params?authorized=1',
        },
        {
          source: '/has-rewrite-4',
          has: [
            {
              type: 'host',
              value: 'example.com',
            },
          ],
          destination: '/with-params?host=1',
        },
        {
          source: '/has-rewrite-5',
          has: [
            {
              type: 'query',
              key: 'hasParam',
            },
          ],
          destination: '/:hasParam',
        },
        {
          source: '/has-rewrite-6',
          has: [
            {
              type: 'header',
              key: 'hasParam',
              value: 'with-params',
            },
          ],
          destination: '/with-params',
        },
        {
          source: '/has-rewrite-7',
          has: [
            {
              type: 'query',
              key: 'hasParam',
              value: '(?<idk>with-params|hello)',
            },
          ],
          destination: '/with-params?idk=:idk',
        },
        {
          source: '/has-rewrite-8',
          has: [
            {
              type: 'query',
              key: 'post',
            },
          ],
          destination: '/blog-catchall/:post',
        },
        {
          source: '/missing-rewrite-1',
          missing: [
            {
              type: 'header',
              key: 'x-my-header',
              value: '(?<myHeader>.*)',
            },
          ],
          destination: '/with-params',
        },
        {
          source: '/missing-rewrite-2',
          missing: [
            {
              type: 'query',
              key: 'my-query',
            },
          ],
          destination: '/with-params',
        },
        {
          source: '/missing-rewrite-3',
          missing: [
            {
              type: 'cookie',
              key: 'loggedIn',
              value: '(?<loggedIn>true)',
            },
          ],
          destination: '/with-params?authorized=1',
        },
        {
          source: '/blog/about',
          destination: '/hello',
        },
        {
          source: '/overridden/:path*',
          destination: '/overridden',
        },
      ],
      beforeFiles: [
        {
          source: '/hello',
          has: [
            {
              type: 'query',
              key: 'overrideMe',
            },
          ],
          destination: '/with-params?overridden=1',
        },
        {
          source: '/old-blog/:path*',
          destination: '/blog/:path*',
        },
        {
          source: '/overridden',
          destination: 'https://example.vercel.sh',
        },
        {
          source: '/nfl/:path*',
          destination: '/_sport/nfl/:path*',
        },
      ],
    }
  },
  async redirects() {
    return [
      {
        source: '/missing-redirect-1',
        missing: [
          {
            type: 'header',
            key: 'x-my-header',
            value: '(?<myHeader>.*)',
          },
        ],
        destination: '/with-params',
        permanent: false,
      },
      {
        source: '/missing-redirect-2',
        missing: [
          {
            type: 'query',
            key: 'my-query',
          },
        ],
        destination: '/with-params',
        permanent: false,
      },
      {
        source: '/missing-redirect-3',
        missing: [
          {
            type: 'cookie',
            key: 'loggedIn',
            value: '(?<loggedIn>true)',
          },
        ],
        destination: '/with-params?authorized=1',
        permanent: false,
      },
      {
        source: '/redirect/me/to-about/:lang',
        destination: '/:lang/about',
        permanent: false,
      },
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
        destination: '/got-unnamed',
        permanent: false,
      },
      {
        source: '/named-like-unnamed/:0',
        destination: '/:0',
        permanent: false,
      },
      {
        source: '/redirect-override',
        destination: '/thank-you-next',
        permanent: false,
      },
      {
        source: '/docs/:first(integrations|now-cli)/v2:second(.*)',
        destination: '/:first/:second',
        permanent: false,
      },
      {
        source: '/catchall-redirect/:path*',
        destination: '/somewhere',
        permanent: false,
      },
      {
        source: '/to-external-with-query',
        destination:
          'https://authserver.example.com/set-password?returnUrl=https%3A%2F%2Fwww.example.com/login',
        permanent: false,
      },
      {
        source: '/to-external-with-query-2',
        destination:
          'https://authserver.example.com/set-password?returnUrl=https://www.example.com/login',
        permanent: false,
      },
      {
        source: '/has-redirect-1',
        has: [
          {
            type: 'header',
            key: 'x-my-header',
            value: '(?<myHeader>.*)',
          },
        ],
        destination: '/another?myHeader=:myHeader',
        permanent: false,
      },
      {
        source: '/has-redirect-2',
        has: [
          {
            type: 'query',
            key: 'my-query',
          },
        ],
        destination: '/another?value=:myquery',
        permanent: false,
      },
      {
        source: '/has-redirect-3',
        has: [
          {
            type: 'cookie',
            key: 'loggedIn',
            value: 'true',
          },
        ],
        destination: '/another?authorized=1',
        permanent: false,
      },
      {
        source: '/has-redirect-4',
        has: [
          {
            type: 'host',
            value: 'example.com',
          },
        ],
        destination: '/another?host=1',
        permanent: false,
      },
      {
        source: '/:path/has-redirect-5',
        has: [
          {
            type: 'header',
            key: 'x-test-next',
          },
        ],
        destination: '/somewhere',
        permanent: false,
      },
      {
        source: '/has-redirect-6',
        has: [
          {
            type: 'host',
            value: '(?<subdomain>.*)-test.example.com',
          },
        ],
        destination: 'https://:subdomain.example.com/some-path/end?a=b',
        permanent: false,
      },
      {
        source: '/has-redirect-7',
        has: [
          {
            type: 'query',
            key: 'hello',
            value: '(?<hello>.*)',
          },
        ],
        destination: '/somewhere?value=:hello',
        permanent: false,
      },
    ]
  },

  async headers() {
    return [
      {
        source: '/missing-headers-1',
        missing: [
          {
            type: 'header',
            key: 'x-my-header',
            value: '(?<myHeader>.*)',
          },
        ],
        headers: [
          {
            key: 'x-new-header',
            value: 'new-value',
          },
        ],
      },
      {
        source: '/missing-headers-2',
        missing: [
          {
            type: 'query',
            key: 'my-query',
          },
        ],
        headers: [
          {
            key: 'x-new-header',
            value: 'new-value',
          },
        ],
      },
      {
        source: '/missing-headers-3',
        missing: [
          {
            type: 'cookie',
            key: 'loggedIn',
            value: '(?<loggedIn>true)',
          },
        ],
        headers: [
          {
            key: 'x-new-header',
            value: 'new-value',
          },
        ],
      },
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
      {
        source: '/my-other-header/:path',
        headers: [
          {
            key: 'x-path',
            value: ':path',
          },
          {
            key: 'some:path',
            value: 'hi',
          },
          {
            key: 'x-test',
            value: 'some:value*',
          },
          {
            key: 'x-test-2',
            value: 'value*',
          },
          {
            key: 'x-test-3',
            value: ':value?',
          },
          {
            key: 'x-test-4',
            value: ':value+',
          },
          {
            key: 'x-test-5',
            value: 'something https:',
          },
          {
            key: 'x-test-6',
            value: ':hello(world)',
          },
          {
            key: 'x-test-7',
            value: 'hello(world)',
          },
          {
            key: 'x-test-8',
            value: 'hello{1,}',
          },
          {
            key: 'x-test-9',
            value: ':hello{1,2}',
          },
          {
            key: 'content-security-policy',
            value:
              "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/:path",
          },
        ],
      },
      {
        source: '/without-params/url',
        headers: [
          {
            key: 'x-origin',
            value: 'https://example.com',
          },
        ],
      },
      {
        source: '/with-params/url/:path*',
        headers: [
          {
            key: 'x-url',
            value: 'https://example.com/:path*',
          },
        ],
      },
      {
        source: '/with-params/url2/:path*',
        headers: [
          {
            key: 'x-url',
            value: 'https://example.com:8080?hello=:path*',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'x-something',
            value: 'applied-everywhere',
          },
        ],
      },
      {
        source: '/named-pattern/:path(.*)',
        headers: [
          {
            key: 'x-something',
            value: 'value=:path',
          },
          {
            key: 'path-:path',
            value: 'end',
          },
        ],
      },
      {
        source: '/catchall-header/:path*',
        headers: [
          {
            key: 'x-value',
            value: ':path*',
          },
        ],
      },
      {
        source: '/has-header-1',
        has: [
          {
            type: 'header',
            key: 'x-my-header',
            value: '(?<myHeader>.*)',
          },
        ],
        headers: [
          {
            key: 'x-another',
            value: 'header',
          },
        ],
      },
      {
        source: '/has-header-2',
        has: [
          {
            type: 'query',
            key: 'my-query',
          },
        ],
        headers: [
          {
            key: 'x-added',
            value: 'value',
          },
        ],
      },
      {
        source: '/has-header-3',
        has: [
          {
            type: 'cookie',
            key: 'loggedIn',
            value: 'true',
          },
        ],
        headers: [
          {
            key: 'x-is-user',
            value: 'yuuuup',
          },
        ],
      },
      {
        source: '/has-header-4',
        has: [
          {
            type: 'host',
            value: 'example.com',
          },
        ],
        headers: [
          {
            key: 'x-is-host',
            value: 'yuuuup',
          },
        ],
      },
    ]
  },
}
