module.exports = {
  i18n: {
    locales: ['en', 'nl'],
    defaultLocale: 'en',
  },
  experimental: {
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
  },
  redirects() {
    return [
      {
        source: '/to-new',
        destination: '/new',
        permanent: false,
      },
    ]
  },
}
