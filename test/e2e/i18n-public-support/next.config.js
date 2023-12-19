/**
 * @type {import('next').NextConfig}
 */
module.exports = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    domains: [
      {
        domain: 'example.com',
        defaultLocale: 'en',
      },
      {
        domain: 'example.fr',
        defaultLocale: 'fr',
      },
    ],
  },
}
