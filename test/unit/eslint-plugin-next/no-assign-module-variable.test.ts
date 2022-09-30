import rule from '@next/eslint-plugin-next/dist/rules/no-assign-module-variable'
import { RuleTester } from 'eslint'
;(RuleTester as any).setDefaultConfig({
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
})
const ruleTester = new RuleTester()

ruleTester.run('no-assign-module-variable', rule, {
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
