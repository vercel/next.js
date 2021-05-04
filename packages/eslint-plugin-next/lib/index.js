module.exports = {
  rules: {
    'no-css-tags': require('./rules/no-css-tags'),
    'no-sync-scripts': require('./rules/no-sync-scripts'),
    'no-html-link-for-pages': require('./rules/no-html-link-for-pages'),
    'no-unwanted-polyfillio': require('./rules/no-unwanted-polyfillio'),
    'no-page-custom-font': require('./rules/no-page-custom-font'),
  },
  configs: {
    recommended: {
      plugins: ['@next/next'],
      rules: {
        '@next/next/no-css-tags': 1,
        '@next/next/no-sync-scripts': 1,
        '@next/next/no-html-link-for-pages': 1,
        '@next/next/no-unwanted-polyfillio': 1,
        '@next/next/no-page-custom-font': 1,
      },
    },
  },
}
