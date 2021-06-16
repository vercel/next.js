module.exports = {
  extends: ['.'].map(require.resolve),
  rules: {
    '@next/next/no-sync-scripts': 2,
    '@next/next/no-html-link-for-pages': 2,
    '@next/next/no-img-element': 2,
  },
}
