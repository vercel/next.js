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
      filename: 'pages/_middleware.js',
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: `pages${path.sep}_middleware.js`,
    },
    {
      code: `import NextDocument from "next/document"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: `pages${path.posix.sep}_middleware.tsx`,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'pages/_middleware.page.tsx',
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'pages/_middleware/index.js',
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'pages/_middleware/index.tsx',
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'pagesapp/src/pages/_middleware.js',
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
            'next/server should not be imported outside of pages/_middleware.js. See https://nextjs.org/docs/messages/no-server-import-in-page.',
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
            'next/server should not be imported outside of pages/_middleware.js. See https://nextjs.org/docs/messages/no-server-import-in-page.',
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
            'next/server should not be imported outside of pages/_middleware.js. See https://nextjs.org/docs/messages/no-server-import-in-page.',
          type: 'ImportDeclaration',
        },
      ],
    },
  ],
})
