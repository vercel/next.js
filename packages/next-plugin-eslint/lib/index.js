module.exports = {
  rules: {
    'no-css-tags': require('./rules/no-css-tags'),
    'sync-scripts': require('./rules/sync-scripts'),
  },
  configs: {
    recommended: {
      rules: {
        '@next/next/no-css-tags': 2,
        '@next/next/sync-scripts': 2,
      },
    },
  },
}
