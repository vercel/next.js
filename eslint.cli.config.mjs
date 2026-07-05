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
    // NOTE: eslint.config.mjs has a config block that mirrors these
    // `files`/`ignores` to override non-type-checked rules for the same set of
    // files. Keep both in sync if you change the globs.
    ignores: [
      'bench/**/*',
      'examples/**/*',
      'test/**/*',
      '**/*.d.ts',
      'turbopack/**/*',
    ],
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
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { requireDefaultForNonUnion: true },
      ],
    },
  },
])
