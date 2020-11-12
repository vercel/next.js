module.exports = {
  // target: 'experimental-serverless-trace',
  i18n: {
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
}
