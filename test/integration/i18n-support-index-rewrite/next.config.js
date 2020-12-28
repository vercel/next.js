module.exports = {
  i18n: {
    // localeDetection: false,
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en'],
    defaultLocale: 'en',
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
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/company/about-us',
      },
    ]
  },
}
