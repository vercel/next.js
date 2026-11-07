/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/old/:id', destination: '/plain/:id' },
      {
        source: '/nl-NL/explicit/:id',
        destination: '/en-US/plain/:id',
        locale: false,
      },
    ]
  },
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
