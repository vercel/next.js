module.exports = {
  locales: ['en', 'sv'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: '<rootDir>/locale/{locale}/messages',
      include: ['<rootDir>/'],
      exclude: ['**/node_modules/**'],
    },
  ],
}
