module.exports = {
  // target: 'experimental-serverless-trace',
  // basePath: '/docs',
  i18n: {
    // localeDetection: false,
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en-US', 'en'],
    defaultLocale: 'en-US',
    domains: [
      {
        // used for testing, this should not be needed in most cases
        // as production domains should always use https
        http: true,
        domain: 'example.be',
        defaultLocale: 'nl-BE',
        locales: ['nl', 'nl-NL', 'nl-BE'],
      },
      {
        http: true,
        domain: 'example.fr',
        defaultLocale: 'fr',
        locales: ['fr-BE'],
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
        destination: '/another',
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
      {
        source: '/rewrite-5',
        destination: 'http://localhost:__EXTERNAL_PORT__',
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
