import type { Linter } from 'eslint'

// plugins
import next from '@next/eslint-plugin-next'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import tsEslint from 'typescript-eslint'
// import * as ... for plugins without default export
import * as importPlugin from 'eslint-plugin-import'
import * as jsxA11yPlugin from 'eslint-plugin-jsx-a11y'

// utils
import globals from 'globals'
import eslintParser from './parser'

const config: Linter.Config[] = [
  {
    name: 'next',
    // Default files, users can overwrite this.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
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
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.mts', '.cts', '.tsx', '.d.ts'],
      },
      'import/resolver': {
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
