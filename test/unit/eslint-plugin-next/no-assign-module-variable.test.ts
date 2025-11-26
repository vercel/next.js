import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-assign-module-variable']

const tests = {
  valid: [
    `
      let myModule = {};

      export default function MyComponent() {
        return <></>
      }
    `,
  ],
  invalid: [
    {
      code: `
      let module = {};

      export default function MyComponent() {
        return <></>
      }
      `,
      errors: [
        {
          message:
            'Do not assign to the variable `module`. See: https://nextjs.org/docs/messages/no-assign-module-variable',
        },
      ],
    },
  ],
}

describe('no-assign-module-variable', () => {
  new RuleTester({
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          modules: true,
          jsx: true,
        },
      },
    },
  }).run('eslint', NextESLintRule, tests)
})
