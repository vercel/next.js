import type { ESLint, Linter, Rule } from 'eslint'

import { googleFontDisplay } from './rules/google-font-display.js'
import { googleFontPreconnect } from './rules/google-font-preconnect.js'
import { inlineScriptId } from './rules/inline-script-id.js'
import { nextScriptForGa } from './rules/next-script-for-ga.js'
import { noAssignModuleVariable } from './rules/no-assign-module-variable.js'
import { noAsyncClientComponent } from './rules/no-async-client-component.js'
import { noBeforeInteractiveScriptOutsideDocument } from './rules/no-before-interactive-script-outside-document.js'
import { noCssTags } from './rules/no-css-tags.js'
import { noDocumentImportInPage } from './rules/no-document-import-in-page.js'
import { noDuplicateHead } from './rules/no-duplicate-head.js'
import { noHeadElement } from './rules/no-head-element.js'
import { noHeadImportInDocument } from './rules/no-head-import-in-document.js'
import { noHtmlLinkForPages } from './rules/no-html-link-for-pages.js'
import { noImgElement } from './rules/no-img-element.js'
import { noPageCustomFont } from './rules/no-page-custom-font.js'
import { noScriptComponentInHead } from './rules/no-script-component-in-head.js'
import { noStyledJsxInDocument } from './rules/no-styled-jsx-in-document.js'
import { noSyncScripts } from './rules/no-sync-scripts.js'
import { noTitleInDocumentHead } from './rules/no-title-in-document-head.js'
import { noTypos } from './rules/no-typos.js'
import { noUnwantedPolyfillio } from './rules/no-unwanted-polyfillio.js'

/**
 * The namespace prefix for all rules in this plugin
 */
const name = '@next/next'

interface PluginConfig extends ESLint.Plugin {
  rules: {
    '@next/next/google-font-display': Rule.RuleModule
    '@next/next/google-font-preconnect': Rule.RuleModule
    '@next/next/inline-script-id': Rule.RuleModule
    '@next/next/next-script-for-ga': Rule.RuleModule
    '@next/next/no-assign-module-variable': Rule.RuleModule
    '@next/next/no-async-client-component': Rule.RuleModule
    '@next/next/no-before-interactive-script-outside-document': Rule.RuleModule
    '@next/next/no-css-tags': Rule.RuleModule
    '@next/next/no-document-import-in-page': Rule.RuleModule
    '@next/next/no-duplicate-head': Rule.RuleModule
    '@next/next/no-head-element': Rule.RuleModule
    '@next/next/no-head-import-in-document': Rule.RuleModule
    '@next/next/no-html-link-for-pages': Rule.RuleModule
    '@next/next/no-img-element': Rule.RuleModule
    '@next/next/no-page-custom-font': Rule.RuleModule
    '@next/next/no-script-component-in-head': Rule.RuleModule
    '@next/next/no-styled-jsx-in-document': Rule.RuleModule
    '@next/next/no-sync-scripts': Rule.RuleModule
    '@next/next/no-title-in-document-head': Rule.RuleModule
    '@next/next/no-typos': Rule.RuleModule
    '@next/next/no-unwanted-polyfillio': Rule.RuleModule
  }
  configs: {
    'core-web-vitals': Linter.LegacyConfig
    'core-web-vitals/flat': Linter.Config
    recommended: Linter.LegacyConfig
    'recommended/flat': Linter.Config
  }
  name: string
}

const plugin: ESLint.Plugin = {
  rules: {
    [`${name}/google-font-display`]: googleFontDisplay,
    [`${name}/google-font-preconnect`]: googleFontPreconnect,
    [`${name}/inline-script-id`]: inlineScriptId,
    [`${name}/next-script-for-ga`]: nextScriptForGa,
    [`${name}/no-assign-module-variable`]: noAssignModuleVariable,
    [`${name}/no-async-client-component`]: noAsyncClientComponent,
    [`${name}/no-before-interactive-script-outside-document`]:
      noBeforeInteractiveScriptOutsideDocument,
    [`${name}/no-css-tags`]: noCssTags,
    [`${name}/no-document-import-in-page`]: noDocumentImportInPage,
    [`${name}/no-duplicate-head`]: noDuplicateHead,
    [`${name}/no-head-element`]: noHeadElement,
    [`${name}/no-head-import-in-document`]: noHeadImportInDocument,
    [`${name}/no-html-link-for-pages`]: noHtmlLinkForPages,
    [`${name}/no-img-element`]: noImgElement,
    [`${name}/no-page-custom-font`]: noPageCustomFont,
    [`${name}/no-script-component-in-head`]: noScriptComponentInHead,
    [`${name}/no-styled-jsx-in-document`]: noStyledJsxInDocument,
    [`${name}/no-sync-scripts`]: noSyncScripts,
    [`${name}/no-title-in-document-head`]: noTitleInDocumentHead,
    [`${name}/no-typos`]: noTypos,
    [`${name}/no-unwanted-polyfillio`]: noUnwantedPolyfillio,
  },
  name,
}

const recommendedRules: Linter.RulesRecord = {
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

const coreWebVitalsRules: Linter.RulesRecord = {
  ...recommendedRules,
  '@next/next/no-html-link-for-pages': 'error',
  '@next/next/no-sync-scripts': 'error',
}

const createRuleConfig = (
  pluginName: string,
  rules: Linter.RulesRecord,
  isFlat = false
) => {
  return {
    plugins: isFlat ? { [pluginName]: plugin } : [pluginName],
    rules,
  }
}

const recommendedFlatConfig = createRuleConfig(name, recommendedRules, true)
const recommendedLegacyConfig = createRuleConfig(name, recommendedRules, false)
const coreWebVitalsFlatConfig = createRuleConfig(name, coreWebVitalsRules, true)
const coreWebVitalsLegacyConfig = createRuleConfig(
  name,
  coreWebVitalsRules,
  false
)

/**
 * ESLint plugin for Next.js projects
 */
export default {
  ...plugin,
  configs: {
    /**
     * Legacy config (ESLint < v9) with Core Web Vitals rules (recommended with some warnings upgrade to errors)
     */
    'core-web-vitals': coreWebVitalsLegacyConfig,
    /**
     * Flat config (ESLint v9+) with Core Web Vitals rules (recommended with some warnings upgrade to errors)
     */
    'core-web-vitals/flat': coreWebVitalsFlatConfig,
    /**
     * Legacy config (ESLint < v9) with recommended rules
     */
    recommended: recommendedLegacyConfig,
    /**
     * Flat config (ESLint v9+) with recommended rules
     */
    'recommended/flat': recommendedFlatConfig,
  },
} as PluginConfig
