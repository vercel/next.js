module.exports = {
  // target: 'experimental-serverless-trace',
  experimental: {
    i18n: {
      locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en-US', 'en'],
      defaultLocale: 'en-US',
      domains: [
        {
          domain: 'example.be',
          defaultLocale: 'nl-BE',
          locales: ['nl-BE', 'fr-BE'],
        },
        {
          domain: 'example.fr',
          locales: ['fr', 'fr-BE'],
          defaultLocale: 'fr',
        },
      ],
    },
  },
}
