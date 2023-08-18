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

ruleTester.run('no-async-client-component single line capitalization', rule, {
  valid: [
    `
    "use client"

    export default async function myFunction() {
      return ''
    }
    `,
  ],
  invalid: [
    {
      code: `
      "use client"

      export default async function MyFunction() {
        return ''
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

ruleTester.run('no-async-client-component multiple line capitalization', rule, {
  valid: [
    `
    "use client"

    async function myFunction() {
      return ''
    }

    export default myFunction
    `,
  ],
  invalid: [
    {
      code: `
      "use client"

      async function MyFunction() {
        return ''
      }

      export default MyFunction
      `,
      errors: [
        {
          message,
        },
      ],
    },
  ],
})

ruleTester.run('no-async-client-component arrow function', rule, {
  valid: [
    `
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
      "use client"

      const MyFunction = async () => {
        return '123'
      }

      export default MyFunction
      `,
      errors: [
        {
          message,
        },
      ],
    },
  ],
})
