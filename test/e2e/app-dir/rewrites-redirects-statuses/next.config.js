module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/catch/config-rewrite-503-before-files',
          destination: '/catch/config-rewrite-503-before-files',
          unstable_statusCode: 503,
        },
      ],
      afterFiles: [
        {
          source: '/catch/config-rewrite-before',
          destination: '/catch/config-rewrite-after',
        },
        {
          source: '/catch/config-rewrite-203-before',
          destination: '/catch/config-rewrite-203-after',
          unstable_statusCode: 203,
        },
        {
          source: '/catch/config-rewrite-320-before',
          destination: '/catch/config-rewrite-320-after',
          unstable_statusCode: 320,
        },
      ],
      fallback: [
        {
          source: '/:path*',
          destination: '/404',
          unstable_statusCode: 404,
        },
      ],
    }
  },
  async redirects() {
    return [
      {
        source: '/catch/config-redirect-before',
        destination: '/catch/config-redirect-after',
        permanent: true,
      },
      {
        source: '/catch/config-redirect-307-before',
        destination: '/catch/config-redirect-307-after',
        statusCode: 307,
      },
      {
        source: '/catch/config-redirect-308-before',
        destination: '/catch/config-redirect-308-after',
        statusCode: 308,
      },
      {
        source: '/catch/config-redirect-catchall-before/:path*',
        destination: '/catch/config-redirect-catchall-after/:path*',
        permanent: true,
      },
    ]
  },
}
