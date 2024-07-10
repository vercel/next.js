import rule from '@next/eslint-plugin-next/dist/rules/no-redirect-in-try-catch'
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

ruleTester.run('no-redirect-in-try-catch', rule, {
  valid: [
    `'use server'

    import { redirect } from "next/navigation"
    
    export async function navigate(data) {
        redirect(\`/posts/\${data.get('id')}\`)
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
            'Do not use `redirect` within a try-catch block. Move the `redirect` call outside of the try-catch block. See: https://nextjs.org/docs/messages/no-redirect-in-try-catch',
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
            'Do not use `redirect` within a try-catch block. Move the `redirect` call outside of the try-catch block. See: https://nextjs.org/docs/messages/no-redirect-in-try-catch',
        },
      ],
    },
  ],
})
