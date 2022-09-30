import rule from '@next/eslint-plugin-next/dist/rules/no-head-element'
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

ruleTester.run('no-head-element', rule, {
  valid: [
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }
    `,
      filename: 'pages/index.js',
    },
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }
    `,
      filename: 'pages/index.tsx',
    },
    {
      code: `
      export default function Layout({ children }) {
        return (
          <html>
            <head>
              <title>layout</title>
            </head>
            <body>{children}</body>
          </html>
        );
      }
    `,
      filename: './app/layout.js',
    },
  ],
  invalid: [
    {
      code: `
      export class MyComponent {
        render() {
          return (
            <div>
              <head>
                <title>My page title</title>
              </head>
            </div>
          );
        }
      }`,
      filename: './pages/index.js',
      errors: [
        {
          message:
            'Do not use `<head>` element. Use `<Head />` from `next/head` instead. See: https://nextjs.org/docs/messages/no-head-element',
          type: 'JSXOpeningElement',
        },
      ],
    },
    {
      code: `import Head from 'next/head';

      export class MyComponent {
        render() {
          return (
            <div>
              <head>
                <title>My page title</title>
              </head>
              <Head>
                <title>My page title</title>
              </Head>
            </div>
          );
        }
      }`,
      filename: 'pages/index.ts',
      errors: [
        {
          message:
            'Do not use `<head>` element. Use `<Head />` from `next/head` instead. See: https://nextjs.org/docs/messages/no-head-element',
          type: 'JSXOpeningElement',
        },
      ],
    },
  ],
})
