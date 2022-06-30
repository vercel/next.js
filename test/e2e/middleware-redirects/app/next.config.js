module.exports = {
  i18n: {
    locales: ['en', 'fr', 'nl', 'es'],
    defaultLocale: 'en',
  },
  redirects() {
    return [
      {
        source: '/to-new',
        destination: '/dynamic/new',
        permanent: false,
      },
    ]
  },
}
