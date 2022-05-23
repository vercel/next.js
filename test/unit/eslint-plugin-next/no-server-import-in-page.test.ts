import { RuleTester } from 'eslint'
import path from 'path'
import rule from '@next/eslint-plugin-next/lib/rules/no-server-import-in-page'
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

ruleTester.run('no-server-import-in-page', rule, {
  valid: [
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'middleware.js',
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: `${path.sep}middleware.js`,
    },
    {
      code: `import NextDocument from "next/document"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: `${path.posix.sep}middleware.tsx`,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'middleware.page.tsx',
    },
  ],
  invalid: [
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: 'components/test.js',
      errors: [
        {
          message:
            'next/server should not be imported outside of middleware.js. See: https://nextjs.org/docs/messages/no-server-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: 'pages/test.js',
      errors: [
        {
          message:
            'next/server should not be imported outside of middleware.js. See: https://nextjs.org/docs/messages/no-server-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: `pages${path.sep}test.js`,
      errors: [
        {
          message:
            'next/server should not be imported outside of middleware.js. See: https://nextjs.org/docs/messages/no-server-import-in-page',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
})
