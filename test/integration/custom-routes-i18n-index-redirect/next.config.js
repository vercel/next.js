module.exports = {
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'en',
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/destination',
        permanent: false,
      },
    ]
  },
}
