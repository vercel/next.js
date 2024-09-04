import rule from '@next/eslint-plugin-next/dist/rules/no-redirect-in-try-catch-without-rethrow'
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

ruleTester.run('no-redirect-in-try-catch-without-rethrow', rule, {
  valid: [
    `'use server'

    import { redirect } from "next/navigation"

    export async function navigate(data) {
        redirect(\`/posts/\${data.get('id')}\`)
    }`,
    `'use server'

    import { redirect, unstable_rethrow } from "next/navigation"

    export async function navigate(data) {
      try {
        redirect(\`/posts/\${data.get('id')}\`)
      } catch (error) {
        unstable_rethrow(error)
      }
    }`,
    `'use server'

    import { redirect, unstable_rethrow as rethrow } from "next/navigation"

    export async function navigate(data) {
      try {
        redirect(\`/posts/\${data.get('id')}\`)
      } catch (error) {
        rethrow(error)
      }
    }`,
    `'use server'

    import * as Navigation from "next/navigation"

    export async function navigate(data) {
      try {
        Navigation.redirect(\`/posts/\${data.get('id')}\`)
      } catch (error) {
        Navigation.unstable_rethrow(error)
      }
    }`,
  ],
  invalid: [
    {
      code: `
      'use server'

      import { redirect } from "next/navigation"
      
      export async function navigate(data) {
        try {
          redirect(\`/posts/\${data.get('id')}\`)
        } catch (e) {
          console.error(e);
        }
      }`,
      filename: 'app/actions.ts',
      errors: [
        {
          message:
            'When using `redirect` in a try-catch block, ensure you include `unstable_rethrow` at the start of the catch block to properly handle Next.js errors. See: https://nextjs.org/docs/messages/no-redirect-in-try-catch-without-rethrow',
        },
      ],
    },
    {
      code: `
      'use server'

      import { redirect } from "next/navigation"

      export async function navigate(data) {
        try {
          if (data.id) {
            redirect(\`/posts/\${data.id}\`)
          }
        } catch (e) {
          console.error(e);
        }
      }`,
      filename: 'app/actions.ts',
      errors: [
        {
          message:
            'When using `redirect` in a try-catch block, ensure you include `unstable_rethrow` at the start of the catch block to properly handle Next.js errors. See: https://nextjs.org/docs/messages/no-redirect-in-try-catch-without-rethrow',
        },
      ],
    },
    {
      code: `
      'use server'

      import { redirect, unstable_rethrow } from "next/navigation"

      export async function navigate(data) {
        try {
          redirect(\`/posts/\${data.get('id')}\`)
        } catch (e) {
          console.error(e);
          unstable_rethrow(e);
        }
      }`,
      filename: 'app/actions.ts',
      errors: [
        {
          message:
            'When using `redirect` in a try-catch block, ensure you include `unstable_rethrow` at the start of the catch block to properly handle Next.js errors. See: https://nextjs.org/docs/messages/no-redirect-in-try-catch-without-rethrow',
        },
      ],
    },
  ],
})
