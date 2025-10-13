import type { Linter } from 'eslint'

const config: Linter.LegacyConfig = {
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': 1,
    '@typescript-eslint/no-unused-expressions': 1,
  },
}

export = config
