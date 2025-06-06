const recommendedRules = {
  // warnings
  '@next/next/google-font-display': 'warn',
  '@next/next/google-font-preconnect': 'warn',
  '@next/next/next-script-for-ga': 'warn',
  '@next/next/no-async-client-component': 'warn',
  '@next/next/no-before-interactive-script-outside-document': 'warn',
  '@next/next/no-css-tags': 'warn',
  '@next/next/no-head-element': 'warn',
  '@next/next/no-html-link-for-pages': 'warn',
  '@next/next/no-img-element': 'warn',
  '@next/next/no-page-custom-font': 'warn',
  '@next/next/no-styled-jsx-in-document': 'warn',
  '@next/next/no-sync-scripts': 'warn',
  '@next/next/no-title-in-document-head': 'warn',
  '@next/next/no-typos': 'warn',
  '@next/next/no-unwanted-polyfillio': 'warn',
  // errors
  '@next/next/inline-script-id': 'error',
  '@next/next/no-assign-module-variable': 'error',
  '@next/next/no-document-import-in-page': 'error',
  '@next/next/no-duplicate-head': 'error',
  '@next/next/no-head-import-in-document': 'error',
  '@next/next/no-script-component-in-head': 'error',
}

const coreWebVitalsRules = {
  '@next/next/no-html-link-for-pages': 'error',
  '@next/next/no-sync-scripts': 'error',
}

const plugin = {
  rules: {
    'google-font-display':
      require('./rules/google-font-display') as typeof import('./rules/google-font-display'),
    'google-font-preconnect':
      require('./rules/google-font-preconnect') as typeof import('./rules/google-font-preconnect'),
    'inline-script-id':
      require('./rules/inline-script-id') as typeof import('./rules/inline-script-id'),
    'next-script-for-ga':
      require('./rules/next-script-for-ga') as typeof import('./rules/next-script-for-ga'),
    'no-assign-module-variable':
      require('./rules/no-assign-module-variable') as typeof import('./rules/no-assign-module-variable'),
    'no-async-client-component':
      require('./rules/no-async-client-component') as typeof import('./rules/no-async-client-component'),
    'no-before-interactive-script-outside-document':
      require('./rules/no-before-interactive-script-outside-document') as typeof import('./rules/no-before-interactive-script-outside-document'),
    'no-css-tags':
      require('./rules/no-css-tags') as typeof import('./rules/no-css-tags'),
    'no-document-import-in-page':
      require('./rules/no-document-import-in-page') as typeof import('./rules/no-document-import-in-page'),
    'no-duplicate-head':
      require('./rules/no-duplicate-head') as typeof import('./rules/no-duplicate-head'),
    'no-head-element':
      require('./rules/no-head-element') as typeof import('./rules/no-head-element'),
    'no-head-import-in-document':
      require('./rules/no-head-import-in-document') as typeof import('./rules/no-head-import-in-document'),
    'no-html-link-for-pages':
      require('./rules/no-html-link-for-pages') as typeof import('./rules/no-html-link-for-pages'),
    'no-img-element':
      require('./rules/no-img-element') as typeof import('./rules/no-img-element'),
    'no-page-custom-font':
      require('./rules/no-page-custom-font') as typeof import('./rules/no-page-custom-font'),
    'no-script-component-in-head':
      require('./rules/no-script-component-in-head') as typeof import('./rules/no-script-component-in-head'),
    'no-styled-jsx-in-document':
      require('./rules/no-styled-jsx-in-document') as typeof import('./rules/no-styled-jsx-in-document'),
    'no-sync-scripts':
      require('./rules/no-sync-scripts') as typeof import('./rules/no-sync-scripts'),
    'no-title-in-document-head':
      require('./rules/no-title-in-document-head') as typeof import('./rules/no-title-in-document-head'),
    'no-typos':
      require('./rules/no-typos') as typeof import('./rules/no-typos'),
    'no-unwanted-polyfillio':
      require('./rules/no-unwanted-polyfillio') as typeof import('./rules/no-unwanted-polyfillio'),
  },
  configs: {
    recommended: {
      plugins: ['@next/next'],
      rules: recommendedRules,
    },
    'core-web-vitals': {
      plugins: ['@next/next'],
      extends: ['plugin:@next/next/recommended'],
      rules: coreWebVitalsRules,
    },
  },
}

const flatConfig = {
  recommended: {
    name: 'next/recommended',
    plugins: {
      '@next/next': plugin,
    },
    rules: recommendedRules,
  },
  coreWebVitals: {
    name: 'next/core-web-vitals',
    plugins: {
      '@next/next': plugin,
    },
    rules: {
      ...recommendedRules,
      ...coreWebVitalsRules,
    },
  },
}

export default plugin
export const { rules, configs } = plugin
export { flatConfig }
