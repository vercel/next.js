module.exports = {
  i18n: {
    // localeDetection: false,
    locales: ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en'],
    defaultLocale: 'en',
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/base/:path*',
          destination: '/:path*',
          locale: false,
        },
      ],
    }
  },
}
