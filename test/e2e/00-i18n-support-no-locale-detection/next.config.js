module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  async redirects() {
    return [
      {
        source: '/',
        has: [
          {
            type: 'header',
            key: 'x-redirect-me',
          },
        ],
        destination: '/fr-BE',
        permanent: false,
        locale: false,
      },
      {
        source: '/:path+',
        has: [
          {
            type: 'header',
            key: 'x-redirect-me',
          },
        ],
        destination: '/fr-BE/:path+',
        permanent: false,
        locale: false,
      },
    ]
  },
  i18n: {
    localeDetection: false,
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
}
