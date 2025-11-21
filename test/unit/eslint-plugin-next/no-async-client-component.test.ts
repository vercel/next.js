import { RuleTester } from 'eslint'
import { rules } from '@next/eslint-plugin-next'

const NextESLintRule = rules['no-async-client-component']

const message =
  'Prevent Client Components from being async functions. See: https://nextjs.org/docs/messages/no-async-client-component'

const tests = {
  valid: [
    `
    // single line
    export default async function MyComponent() {
      return <></>
    }
    `,
    `
    // single line capitalization
    "use client"

    export default async function myFunction() {
      return ''
    }
    `,
    `
    // multiple line
    async function MyComponent() {
      return <></>
    }

    export default MyComponent
    `,
    `
    // multiple line capitalization
    "use client"

    async function myFunction() {
      return ''
    }

    export default myFunction
    `,
    `
    // arrow function
    "use client"

    const myFunction = () => {
      return ''
    }

    export default myFunction
    `,
  ],
  invalid: [
    {
      code: `
      // single line
      "use client"

      export default async function MyComponent() {
        return <></>
      }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // single line capitalization
      "use client"

      export default async function MyFunction() {
        return ''
      }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // multiple line
      "use client"

      async function MyComponent() {
        return <></>
      }

      export default MyComponent
      `,
      errors: [{ message }],
    },
    {
      code: `
      // multiple line capitalization
      "use client"

      async function MyFunction() {
        return ''
      }

      export default MyFunction
      `,
      errors: [{ message }],
    },
    {
      code: `
      // arrow function
      "use client"

      const MyFunction = async () => {
        return '123'
      }

      export default MyFunction
      `,
      errors: [{ message }],
    },
  ],
}

describe('no-async-client-component', () => {
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
