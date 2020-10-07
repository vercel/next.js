module.exports = {
  rules: {
    'no-css-tags': require('./rules/no-css-tags'),
    'no-sync-scripts': require('./rules/no-sync-scripts'),
    'no-html-link-for-pages': require('./rules/no-html-link-for-pages'),
    'no-unwanted-polyfillio': require('./rules/no-unwanted-polyfillio'),
    'missing-preload': require('./rules/missing-preload'),
    'missing-alt-text': require('./rules/image-component/missing-alt-text'),
    'no-absolute-paths': require('./rules/image-component/no-absolute-paths'),
    'no-unoptimized-relative': require('./rules/image-component/no-unoptimized-relative'),
    'no-unsized-images': require('./rules/image-component/no-unsized-images'),
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
        '@next/next/missing-alt-text': 1,
        '@next/next/no-absolute-paths': 1,
        '@next/next/no-unoptimized-relative': 1,
        '@next/next/no-unsized-images': 1,
      },
    },
  },
}
