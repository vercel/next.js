module.exports = {
  rules: {
    'no-css-tags': require('./rules/no-css-tags'),
    'no-sync-scripts': require('./rules/no-sync-scripts'),
    'no-html-link-for-pages': require('./rules/no-html-link-for-pages'),
    'no-unwanted-polyfillio': require('./rules/no-unwanted-polyfillio'),
    'missing-preload': require('./rules/missing-preload'),
    'no-img-element': require('./rules/no-img-element'),
    'no-static-image-for-external-image': require('./rules/no-static-image-for-external-image'),
    'image-domain': require('./rules/image-domain'),
  },
  configs: {
    recommended: {
      plugins: ['@next/next'],
      rules: {
        '@next/next/no-css-tags': 1,
        '@next/next/no-sync-scripts': 1,
        '@next/next/no-html-link-for-pages': 1,
        '@next/next/no-unwanted-polyfillio': 1,
        '@next/next/missing-preload': 1,
        '@next/next/no-img-element': 1,
        '@next/next/no-static-image-for-external-image': 1,
        '@next/next/image-domain': 1,
      },
    },
  },
}
