import { RuleTester } from 'eslint'

export const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: { modules: true, jsx: true },
  },
})
