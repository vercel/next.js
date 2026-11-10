module.exports = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  rewrites() {
    return {
      fallback: [
        {
          source: '/:path*',
          destination: '/another',
        },
      ],
    }
  },
}
