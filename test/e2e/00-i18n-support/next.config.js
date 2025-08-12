module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  i18n: {
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en-US', 'en'],
    defaultLocale: 'en-US',
    // TODO: testing locale domains support, will require custom
    // testing set-up as test accounts are used currently
    domains: [
      {
        domain: 'example.be',
        defaultLocale: 'nl-BE',
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/en-US/redirect-1',
        destination: '/somewhere-else',
        permanent: false,
        locale: false,
      },
      {
        source: '/nl/redirect-2',
        destination: '/somewhere-else',
        permanent: false,
        locale: false,
      },
      {
        source: '/redirect-3',
        destination: '/somewhere-else',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/en-US/rewrite-1',
        destination: '/en-US/another',
        locale: false,
      },
      {
        source: '/nl/rewrite-2',
        destination: '/nl/another',
        locale: false,
      },
      {
        source: '/fr/rewrite-3',
        destination: '/nl/another',
        locale: false,
      },
      {
        source: '/rewrite-4',
        destination: '/another',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/en-US/add-header-1',
        locale: false,
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
      {
        source: '/nl/add-header-2',
        locale: false,
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
      {
        source: '/add-header-3',
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
