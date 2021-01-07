module.exports = {
  // target: 'experimental-serverless-trace',
  // basePath: '/docs',
  i18n: {
    // localeDetection: false,
    locales: [
      'nl-NL',
      'nl-BE',
      'nl',
      'fr-BE',
      'fr',
      'en-US',
      'en',
      'go',
      'go-BE',
      'do',
      'do-BE',
    ],
    defaultLocale: 'en-US',
    domains: [
      {
        http: true,
        domain: 'example.do',
        defaultLocale: 'do',
        locales: ['do-BE'],
      },
      {
        domain: 'example.com',
        defaultLocale: 'go',
        locales: ['go-BE'],
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
      {
        source: '/redirect-4',
        destination: '/',
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
      {
        source: '/sitemap.xml',
        destination: '/api/hello',
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
