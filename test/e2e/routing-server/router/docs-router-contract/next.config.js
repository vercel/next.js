module.exports = {
  cacheComponents: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'x-contract-phase', value: 'config-headers' }],
      },
      {
        source: '/headers/:path*',
        headers: [{ key: 'x-contract-overwrite', value: 'first' }],
      },
      {
        source: '/headers/:path*',
        headers: [{ key: 'x-contract-overwrite', value: 'last' }],
      },
      {
        source: '/header-order/source',
        headers: [{ key: 'x-contract-header-source', value: 'original' }],
      },
      {
        source: '/api/echo',
        headers: [
          { key: 'x-contract-header-destination', value: 'destination' },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/order/redirect',
        destination: '/api/echo?stage=config-redirect',
        permanent: false,
      },
      {
        source: '/preserve/temporary/:slug',
        destination: '/api/echo?slug=:slug',
        permanent: false,
      },
      {
        source: '/preserve/permanent/:slug',
        destination: '/api/echo?slug=:slug',
        permanent: true,
      },
      {
        source: '/without-proxy',
        destination: '/redirect-destination',
        permanent: false,
      },
      {
        source: '/with-proxy',
        destination: '/redirect-destination',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/header-order/source',
          destination: '/api/echo?stage=header-order',
        },
        {
          source: '/order/proxy',
          destination: '/api/echo?stage=wrong-before-files',
        },
        {
          source: '/order/before-files',
          destination: '/order/before-files-chain',
        },
        {
          source: '/order/before-files-chain',
          destination: '/api/echo?stage=before-files-final',
        },
      ],
      afterFiles: [
        {
          source: '/order/filesystem',
          destination: '/api/echo?stage=wrong-after-files',
        },
        {
          source: '/order/after-files',
          destination: '/api/echo?stage=after-files',
        },
        { source: '/order/after-stop', destination: '/order/filesystem' },
        {
          source: '/order/filesystem',
          destination: '/api/echo?stage=wrong-after-files-chain',
        },
      ],
      fallback: [
        { source: '/order/:path*', destination: '/api/echo?stage=fallback' },
        {
          source: '/generated-true/:slug',
          destination: '/api/echo?stage=wrong-generated-fallback',
        },
        {
          source: '/generated-blocking/:slug',
          destination: '/api/echo?stage=wrong-generated-fallback',
        },
      ],
    }
  },
}
