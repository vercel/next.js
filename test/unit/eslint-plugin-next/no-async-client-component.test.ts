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
    `
    // named export inline, lowercase name is not a component
    "use client"

    export async function myFunction() {
      return ''
    }
    `,
    `
    // named export specifier, lowercase name is not a component
    "use client"

    async function myFunction() {
      return ''
    }

    export { myFunction }
    `,
    `
    // named export non-async function
    "use client"

    export function MyComponent() {
      return <></>
    }
    `,
    `
    // anonymous default async export (no name to flag, must not crash)
    "use client"

    export default async function () {
      return <></>
    }
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
    {
      code: `
      // named export inline async function
      "use client"

      export async function MyComponent() {
        return <></>
      }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // named export inline async arrow function
      "use client"

      export const MyComponent = async () => {
        return <></>
      }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // named export specifier async function
      "use client"

      async function MyComponent() {
        return <></>
      }

      export { MyComponent }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // named export specifier async arrow function
      "use client"

      const MyComponent = async () => {
        return <></>
      }

      export { MyComponent }
      `,
      errors: [{ message }],
    },
    {
      code: `
      // named export specifier aliased to a capitalized component name
      "use client"

      async function foo() {
        return <></>
      }

      export { foo as MyComponent }
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
