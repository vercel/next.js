import rule from '@next/eslint-plugin-next/dist/rules/no-assign-module-variable'
import { RuleTester } from 'eslint-v9'
;(RuleTester as any).setDefaultConfig({
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
})
const ruleTester = new RuleTester()

ruleTester.run('eslint-v9 no-assign-module-variable', rule, {
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
})
