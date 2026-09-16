/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
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

module.exports = nextConfig
