const destination = 'http://localhost:__EXTERNAL_PORT__'

module.exports = {
  i18n: {
    // localeDetection: false,
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en'],
    defaultLocale: 'en',
  },
  async rewrites() {
    return [
      {
        source: '/:path*',
        destination: '/:path*',
      },

      {
        source: '/en',
        destination: '/en/links',
        locale: false,
      },
      {
        source: '/nl-NL',
        destination: '/nl-NL/links',
        locale: false,
      },
      {
        source: '/fr',
        destination: `/fr/links`,
        locale: false,
      },
      {
        source: '/en/about',
        destination: `${destination}/about`,
        locale: false,
      },
      {
        source: '/nl-NL/about',
        destination: `${destination}/about`,
        locale: false,
      },
      {
        source: '/fr/about',
        destination: `${destination}/fr/about`,
        locale: false,
      },

      {
        source: '/en/catch-all/:path*',
        destination: `${destination}/:path*`,
        locale: false,
      },
      {
        source: '/nl-NL/catch-all/:path*',
        destination: `${destination}/:path*`,
        locale: false,
      },
      {
        source: '/fr/catch-all/:path*',
        destination: `${destination}/fr/:path*`,
        locale: false,
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/redirect-1',
        destination: '/destination-1',
        permanent: false,
      },
      {
        source: '/nl-NL/redirect-2',
        destination: '/destination-2',
        locale: false,
        permanent: false,
      },
      {
        source: '/redirect-3',
        destination: '/another',
        permanent: false,
      },
    ]
  },
}
