import type { Linter, Rule } from 'eslint'

import googleFontDisplay from './rules/google-font-display'
import googleFontPreconnect from './rules/google-font-preconnect'
import inlineScriptId from './rules/inline-script-id'
import nextScriptForGa from './rules/next-script-for-ga'
import noAssignModuleVariable from './rules/no-assign-module-variable'
import noAsyncClientComponent from './rules/no-async-client-component'
import noBeforeInteractiveScriptOutsideDocument from './rules/no-before-interactive-script-outside-document'
import noCssTags from './rules/no-css-tags'
import noDocumentImportInPage from './rules/no-document-import-in-page'
import noDuplicateHead from './rules/no-duplicate-head'
import noHeadElement from './rules/no-head-element'
import noHeadImportInDocument from './rules/no-head-import-in-document'
import noHtmlLinkForPages from './rules/no-html-link-for-pages'
import noImgElement from './rules/no-img-element'
import noPageCustomFont from './rules/no-page-custom-font'
import noScriptComponentInHead from './rules/no-script-component-in-head'
import noStyledJsxInDocument from './rules/no-styled-jsx-in-document'
import noSyncScripts from './rules/no-sync-scripts'
import noTitleInDocumentHead from './rules/no-title-in-document-head'
import noTypos from './rules/no-typos'
import noUnwantedPolyfillio from './rules/no-unwanted-polyfillio'

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
} satisfies Linter.RulesRecord

const coreWebVitalsRules = {
  '@next/next/no-html-link-for-pages': 'error',
  '@next/next/no-sync-scripts': 'error',
} satisfies Linter.RulesRecord

const plugin = {
  meta: {
    name: '@next/eslint-plugin-next',
  },
  rules: {
    'google-font-display': googleFontDisplay,
    'google-font-preconnect': googleFontPreconnect,
    'inline-script-id': inlineScriptId,
    'next-script-for-ga': nextScriptForGa,
    'no-assign-module-variable': noAssignModuleVariable,
    'no-async-client-component': noAsyncClientComponent,
    'no-before-interactive-script-outside-document':
      noBeforeInteractiveScriptOutsideDocument,
    'no-css-tags': noCssTags,
    'no-document-import-in-page': noDocumentImportInPage,
    'no-duplicate-head': noDuplicateHead,
    'no-head-element': noHeadElement,
    'no-head-import-in-document': noHeadImportInDocument,
    'no-html-link-for-pages': noHtmlLinkForPages,
    'no-img-element': noImgElement,
    'no-page-custom-font': noPageCustomFont,
    'no-script-component-in-head': noScriptComponentInHead,
    'no-styled-jsx-in-document': noStyledJsxInDocument,
    'no-sync-scripts': noSyncScripts,
    'no-title-in-document-head': noTitleInDocumentHead,
    'no-typos': noTypos,
    'no-unwanted-polyfillio': noUnwantedPolyfillio,
  } satisfies Record<string, Rule.RuleModule>,
  configs: {} as ESLintPluginConfigs,
}

type ESLintPluginConfigs = {
  'recommended-legacy': Linter.LegacyConfig
  'core-web-vitals-legacy': Linter.LegacyConfig
  recommended: Linter.Config
  'core-web-vitals': Linter.Config
}

Object.assign(plugin.configs, {
  'recommended-legacy': {
    plugins: ['@next/next'],
    rules: recommendedRules,
  },
  'core-web-vitals-legacy': {
    plugins: ['@next/next'],
    extends: ['plugin:@next/next/recommended-legacy'],
    rules: coreWebVitalsRules,
  },
  recommended: {
    name: 'next/recommended',
    plugins: {
      '@next/next': plugin,
    },
    rules: recommendedRules,
  },
  'core-web-vitals': {
    name: 'next/core-web-vitals',
    plugins: {
      '@next/next': plugin,
    },
    rules: {
      ...recommendedRules,
      ...coreWebVitalsRules,
    },
  },
} satisfies ESLintPluginConfigs)

export default plugin
export const { rules, configs } = plugin
