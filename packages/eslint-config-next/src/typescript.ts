import type { Linter } from 'eslint'
import tsEslint from 'typescript-eslint'

const config: Linter.Config[] = [
  ...tsEslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
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

export = config
