/**
 * Reproduction for https://github.com/vercel/next.js/issues/86048
 *
 * Pages Router `i18n` config with domain-based routing must not prevent
 * App Router routes (that use a dynamic `[lang]` segment) from resolving.
 */
module.exports = {
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
