module.exports = {
  onDemandEntries: {
    // Make sure entries are not getting disposed.
    maxInactiveAge: 1000 * 60 * 60,
  },
  basePath: '/docs',
  // replace me
  async rewrites() {
    return [
      {
        source: '/rewrite-1',
        destination: '/gssp',
      },
      {
        source: '/rewrite-no-basepath',
        destination: '/gssp',
        basePath: false,
      },
      {
        source: '/rewrite/chain-1',
        destination: '/rewrite/chain-2',
      },
      {
        source: '/rewrite/chain-2',
        destination: '/gssp',
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/redirect-1',
        destination: '/somewhere-else',
        permanent: false,
      },
      {
        source: '/redirect-no-basepath',
        destination: '/another-destination',
        permanent: false,
        basePath: false,
      },
    ]
  },

  async headers() {
    return [
      {
        source: '/add-header',
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
      {
        source: '/add-header-no-basepath',
        basePath: false,
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
    ]
  },
}
