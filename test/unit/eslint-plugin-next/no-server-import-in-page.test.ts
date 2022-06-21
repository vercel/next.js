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

const errors = [
  {
    message:
      '`next/server` should not be used outside of `middleware.js` or other allowed files. See: https://nextjs.org/docs/messages/no-server-import-in-page',
    type: 'ImportDeclaration',
  },
]

const options = {
  allowSpecAndTestFiles: [['**/*.{spec,test}.{ts,tsx,js,jsx}']],
  allow__test__Dir: ['__test__/**'],
}

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
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: `middleware.ts`,
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
      filename: path.join('ws', 'vercel-front/front/middleware.ts'),
    },
    {
      options: options.allow__test__Dir,
      code: `import { NextRequest } from "next/server";

      describe("example", () => {
        it("should pass", () => {
          new Response('Hello, world!');
        });
      });
      `,
      filename: `__test__${path.sep}test.ts`,
    },
    {
      options: options.allowSpecAndTestFiles,
      code: `import { NextRequest } from "next/server";

      describe("example", () => {
        it("should pass", () => {
          new Response('Hello, world!');
        });
      });
      `,
      filename: 'test/example.spec.jsx',
    },
  ],
  invalid: [
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: 'components/test.js',
      errors,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: 'pages/test.js',
      errors,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: 'pages/test.js',
      options: options.allowSpecAndTestFiles,
      errors,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export const Test = () => <p>Test</p>
      `,
      filename: `pages${path.sep}test.js`,
      errors,
    },
    {
      code: `import { NextFetchEvent, NextRequest } from "next/server"

      export function middleware(req, ev) {
        return new Response('Hello, world!')
      }
    `,
      filename: 'middleware.page.tsx',
      errors,
    },
    {
      options: options.allowSpecAndTestFiles,
      code: `import { NextRequest } from "next/server";

      describe("example", () => {
        it("should pass", () => {
          new Response('Hello, world!');
        });
      });
      `,
      filename: 'test/example.jsx',
      errors,
    },
  ],
})
