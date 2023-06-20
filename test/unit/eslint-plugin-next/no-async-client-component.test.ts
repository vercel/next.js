import rule from '@next/eslint-plugin-next/dist/rules/no-async-client-component'
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

const message =
  'Prevent client components from being async functions. See: https://nextjs.org/docs/messages/no-async-client-component'

ruleTester.run('no-async-client-component single line', rule, {
  valid: [
    `
    export default async function MyComponent() {
      return <></>
    }
    `,
  ],
  invalid: [
    {
      code: `
      "use client"

      export default async function MyComponent() {
        return <></>
      }
      `,
      errors: [
        {
          message,
        },
      ],
    },
  ],
})

ruleTester.run('no-async-client-component multiple line', rule, {
  valid: [
    `
    async function MyComponent() {
      return <></>
    }

    export default MyComponent
    `,
  ],
  invalid: [
    {
      code: `
      "use client"

      async function MyComponent() {
        return <></>
      }

      export default MyComponent
      `,
      errors: [
        {
          message,
        },
      ],
    },
  ],
})
