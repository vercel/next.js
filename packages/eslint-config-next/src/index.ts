import type { ESLint, Linter } from 'eslint'

// plugins
import next from '@next/eslint-plugin-next'
import react from './compiled/eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tsEslint from 'typescript-eslint'
// The npm alias keeps the resolver's optional eslint-plugin-import peer
// satisfied with the compatible import-x implementation. Depending only on the
// import-x package name lets strict npm resolution select the old import plugin
// for that optional peer, and its ESLint-through-9 constraint rejects ESLint 10.
import { importX as importPlugin } from 'eslint-plugin-import'
// import * as ... for plugins without default export
import * as jsxA11yPlugin from './compiled/eslint-plugin-jsx-a11y'

// utils
import globals from 'globals'
import eslintParser from './parser'
import { fixupReactPlugin } from './react-plugin'

// React 7.37.5 and JSX-a11y 6.10.2 still declare ESLint-through-9 peers. Ship
// their exactly pinned build-time bundles instead of runtime dependencies, so
// consumers can install this package with ESLint 10 without overrides or a
// second ESLint engine. build-plugins.mjs explains the upgrade-review contract.
const config: Linter.Config[] = [
  {
    name: 'next',
    // Default files, users can overwrite this.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: {
      // This adapter ships with eslint-config-next, so consumers receive the
      // workaround without patching node_modules or changing their own config.
      react: fixupReactPlugin(react),
      // The plugin's nested flat presets do not match ESLint's configs type,
      // but its rule API is supported under both engines. Preserve the whole
      // plugin, including those presets, rather than dropping runtime fields.
      'react-hooks': reactHooks as unknown as ESLint.Plugin,
      import: importPlugin,
      'jsx-a11y': jsxA11yPlugin,
      '@next/next': next,
    },
    languageOptions: {
      parser: eslintParser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: 'module',
        allowImportExportEverywhere: true,
        // TODO: Is this needed?
        babelOptions: {
          presets: ['next/babel'],
          caller: {
            // Eslint supports top level await when a parser for it is included. We enable the parser by default for Babel.
            supportsTopLevelAwait: true,
          },
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.mts', '.cts', '.tsx', '.d.ts'],
      },
      'import-x/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Hooks 7.1 omits this previously enabled rule from its recommended
      // preset. Keep the existing Next rule set, including users' disable
      // directives, rather than changing it as a side effect of compatibility.
      'react-hooks/component-hook-factories': 'error',
      ...next.configs.recommended.rules,
      'import/no-anonymous-default-export': 'warn',
      'react/no-unknown-property': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'jsx-a11y/alt-text': [
        'warn',
        {
          elements: ['img'],
          img: ['Image'],
        },
      ],
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
      'react/jsx-no-target-blank': 'off',
    },
  },
  {
    name: 'next/typescript',
    // Default files, users can overwrite this.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
    },
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        sourceType: 'module',
      },
    },
  },
  // Global ignores, users can add more `ignores` or overwrite this by `!<ignore>`.
  {
    ignores: [
      // node_modules/ and .git/ are ignored by default.
      // https://eslint.org/docs/latest/use/configure/configuration-files#globally-ignoring-files-with-ignores
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
]

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = config
