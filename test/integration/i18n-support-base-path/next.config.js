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
        source: '/en-US/redirect',
        destination: '/somewhere-else',
        permanent: false,
      },
      {
        source: '/nl/redirect',
        destination: '/somewhere-else',
        permanent: false,
      },
      {
        source: '/redirect',
        destination: '/somewhere-else',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/en-US/rewrite',
        destination: '/another',
      },
      {
        source: '/nl/rewrite',
        destination: '/another',
      },
      {
        source: '/rewrite',
        destination: '/another',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/en-US/add-header',
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
      {
        source: '/nl/add-header',
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
        ],
      },
      {
        source: '/add-header',
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
