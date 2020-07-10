module.exports = {
  rules: {
    'no-css-tags': require('./rules/no-css-tags'),
    'no-sync-scripts': require('./rules/no-sync-scripts'),
    'no-html-link-for-pages': require('./rules/no-html-link-for-pages'),
  },
  configs: {
    recommended: {
      plugins: ['@next/next'],
      rules: {
        '@next/next/no-css-tags': 1,
        '@next/next/no-sync-scripts': 1,
        '@next/next/no-html-link-for-pages': 1,
      },
    },
  },
}
