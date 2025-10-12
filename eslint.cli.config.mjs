import { defineConfig } from 'eslint/config'
import baseConfig from './eslint.config.mjs'

export default defineConfig([
  {
    extends: [baseConfig],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // This override adds type-checked rules.
    // Linting with type-checked rules is very slow and needs a lot of memory,
    // so we exclude non-essential files.
    ignores: ['examples/**/*', 'test/**/*', '**/*.d.ts', 'turbopack/**/*'],
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    // These rules are added on top of the rules that are declared in
    // the base config for the matching files.
    rules: {
      // TODO: enable in follow-up PR
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
])
