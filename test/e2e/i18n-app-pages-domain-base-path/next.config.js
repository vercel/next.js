/**
 * Reproduction for https://github.com/vercel/next.js/issues/86048 with a
 * `basePath` configured. Ensures the locale prefix is preserved for App Router
 * routes while the basePath is still stripped before downstream rendering.
 */
module.exports = {
  basePath: '/docs',
  i18n: {
    locales: ['en-US', 'nl-NL'],
    defaultLocale: 'en-US',
    localeDetection: false,
    domains: [
      {
        domain: 'en.example.local',
        defaultLocale: 'en-US',
      },
      {
        domain: 'nl.example.local',
        defaultLocale: 'nl-NL',
      },
    ],
  },
}
